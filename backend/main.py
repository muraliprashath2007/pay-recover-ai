"""
PayRecover AI - FastAPI Main Server
====================================
Provides REST APIs for dashboard metrics, transaction analysis, recovery simulation,
explainable audit logging, model metrics, and demo scenarios.
"""

import os
import json
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from backend.database import get_db_connection, init_db, get_setting, update_setting
from backend.decision_engine import DecisionEngine
from backend.ml_model import METRICS_FILE

# Initialize FastAPI app
app = FastAPI(
    title="PayRecover AI API",
    description="Intelligent Payment Recovery Agent API for Razorpay AI Builder Internship",
    version="2.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")


@app.on_event("startup")
def startup_event():
    """Ensure database is initialized on startup."""
    init_db()


# ---------------------------------------------------------------------------
# Pydantic Request Models
# ---------------------------------------------------------------------------
class SettingUpdate(BaseModel):
    key: str
    value: str

class ManualActionRequest(BaseModel):
    note: Optional[str] = None
    channel: Optional[str] = "Web Dashboard"


# ---------------------------------------------------------------------------
# 1. Dashboard Metrics Endpoint
# ---------------------------------------------------------------------------
@app.get("/api/dashboard")
def get_dashboard_metrics():
    """Compute live dashboard metrics directly from SQLite database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Core KPIs
    cursor.execute("SELECT COUNT(*) FROM transactions")
    total_txns = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM transactions WHERE failure_reason != 'None'")
    failed_row = cursor.fetchone()
    total_failed_count = failed_row[0]
    total_failed_amount = failed_row[1]
    
    cursor.execute("SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM transactions WHERE failure_reason = 'None'")
    initial_success_row = cursor.fetchone()
    initial_success_count = initial_success_row[0]
    
    cursor.execute("SELECT COUNT(*), COALESCE(SUM(recovered_amount), 0) FROM transactions WHERE is_recovered = 1 AND failure_reason != 'None'")
    recovered_row = cursor.fetchone()
    recovered_count = recovered_row[0]
    recovered_amount = recovered_row[1]
    
    recovery_rate = (recovered_count / total_failed_count * 100) if total_failed_count > 0 else 0.0
    
    # Estimate saved gateway fees (assumed ₹15 fee saved per recovered payment by eliminating blind retries)
    saved_fees = recovered_count * 15.0
    
    # 2. Failure Reasons Breakdown
    cursor.execute("""
    SELECT failure_reason, COUNT(*) as count, SUM(amount) as total_amount,
           SUM(CASE WHEN is_recovered = 1 THEN 1 ELSE 0 END) as recovered_count
    FROM transactions
    WHERE failure_reason != 'None'
    GROUP BY failure_reason
    ORDER BY count DESC
    """)
    failure_reasons = []
    for r in cursor.fetchall():
        r_count = r["count"]
        r_rec = r["recovered_count"]
        r_rate = (r_rec / r_count * 100) if r_count > 0 else 0.0
        failure_reasons.append({
            "reason": r["failure_reason"],
            "count": r_count,
            "total_amount": round(r["total_amount"], 2),
            "recovered_count": r_rec,
            "recovery_rate": round(r_rate, 1)
        })
        
    # 3. Recovery Actions Distribution
    cursor.execute("""
    SELECT recovery_action, COUNT(*) as count, SUM(amount) as total_amount
    FROM transactions
    WHERE failure_reason != 'None'
    GROUP BY recovery_action
    ORDER BY count DESC
    """)
    recovery_actions = [
        {"action": r["recovery_action"], "count": r["count"], "amount": round(r["total_amount"], 2)}
        for r in cursor.fetchall()
    ]
    
    # 4. Risk Level Distribution
    cursor.execute("""
    SELECT risk_level, COUNT(*) as count
    FROM transactions
    WHERE failure_reason != 'None'
    GROUP BY risk_level
    """)
    risk_distribution = {r["risk_level"]: r["count"] for r in cursor.fetchall()}
    
    # 5. Payment Methods Breakdown
    cursor.execute("""
    SELECT payment_method, COUNT(*) as total,
           SUM(CASE WHEN payment_status = 'Success' OR is_recovered = 1 THEN 1 ELSE 0 END) as successful
    FROM transactions
    GROUP BY payment_method
    """)
    methods = [
        {
            "method": r["payment_method"],
            "total": r["total"],
            "successful": r["successful"],
            "success_rate": round(r["successful"] / r["total"] * 100, 1) if r["total"] > 0 else 0
        }
        for r in cursor.fetchall()
    ]
    
    conn.close()
    
    return {
        "kpis": {
            "total_transactions": total_txns,
            "failed_payments": total_failed_count,
            "initial_successful": initial_success_count,
            "recovered_payments": recovered_count,
            "recovery_rate_pct": round(recovery_rate, 1),
            "total_recovered_amount": round(recovered_amount, 2),
            "total_at_risk_amount": round(total_failed_amount, 2),
            "saved_gateway_fees": round(saved_fees, 2)
        },
        "failure_reasons": failure_reasons,
        "recovery_actions": recovery_actions,
        "risk_distribution": risk_distribution,
        "payment_methods": methods,
        "demo_mode": get_setting("demo_mode", "true") == "true",
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }


# ---------------------------------------------------------------------------
# 2. Transactions Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/transactions")
def get_transactions(
    status: Optional[str] = None,
    risk_level: Optional[str] = None,
    failure_reason: Optional[str] = None,
    customer_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """Retrieve transactions with comprehensive filtering."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM transactions WHERE 1=1"
    params = []
    
    if status:
        if status.lower() == "failed":
            query += " AND failure_reason != 'None' AND is_recovered = 0"
        elif status.lower() == "recovered":
            query += " AND failure_reason != 'None' AND is_recovered = 1"
        elif status.lower() == "success":
            query += " AND failure_reason = 'None'"
        elif status.lower() == "candidate":
            query += " AND failure_reason != 'None' AND is_recovered = 0 AND retry_count < 3"
            
    if risk_level:
        query += " AND risk_level = ?"
        params.append(risk_level)
        
    if failure_reason:
        query += " AND failure_reason = ?"
        params.append(failure_reason)
        
    if customer_type:
        query += " AND customer_type = ?"
        params.append(customer_type)
        
    if search:
        query += " AND (transaction_id LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?)"
        like_term = f"%{search}%"
        params.extend([like_term, like_term, like_term])
        
    # Count total matching
    count_query = query.replace("SELECT *", "SELECT COUNT(*)")
    cursor.execute(count_query, params)
    total_count = cursor.fetchone()[0]
    
    # Apply ordering and pagination
    query += " ORDER BY transaction_date DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    transactions = [dict(r) for r in rows]
    conn.close()
    
    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "transactions": transactions
    }


@app.get("/api/transactions/{transaction_id}")
def get_transaction(transaction_id: str):
    """Get single transaction detail with decision evaluation."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions WHERE transaction_id = ?", (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")
        
    txn = dict(row)
    
    # Get audit history for this transaction
    cursor.execute("SELECT * FROM audit_logs WHERE transaction_id = ? ORDER BY timestamp DESC", (transaction_id,))
    audit_history = [dict(r) for r in cursor.fetchall()]
    
    conn.close()
    
    # Run dynamic AI analysis
    ai_evaluation = DecisionEngine.evaluate_transaction(txn)
    txn["ai_analysis"] = ai_evaluation
    txn["audit_history"] = audit_history
    return txn


# ---------------------------------------------------------------------------
# 3. AI Analysis Endpoint
# ---------------------------------------------------------------------------
@app.post("/api/analyze/{transaction_id}")
def analyze_transaction(transaction_id: str):
    """Run real-time ML inference and AI decision engine for a transaction."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions WHERE transaction_id = ?", (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    txn = dict(row)
    analysis = DecisionEngine.evaluate_transaction(txn)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Record prediction
    cursor.execute("""
    INSERT INTO model_predictions (transaction_id, recovery_probability, confidence_score, risk_level, predicted_at)
    VALUES (?, ?, ?, ?, ?)
    """, (transaction_id, analysis["recovery_probability"], analysis["confidence_score"], analysis["risk_level"], now_str))
    
    # Update transaction cached recommendation
    cursor.execute("""
    UPDATE transactions
    SET ai_recommendation = ?, ai_reasoning = ?, risk_level = ?, last_updated = ?
    WHERE transaction_id = ?
    """, (analysis["recommended_action"], analysis["reason"], analysis["risk_level"], now_str, transaction_id))
    
    # Log audit event
    cursor.execute("""
    INSERT INTO audit_logs (timestamp, transaction_id, event_type, decision, reason, previous_status, new_status, actor, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        now_str, transaction_id, "AI_ANALYSIS", analysis["recommended_action"],
        analysis["reason"], txn["payment_status"], txn["payment_status"], "AI Decision Engine", "REST API"
    ))
    
    conn.commit()
    conn.close()
    
    return {
        "status": "success",
        "analysis": analysis
    }


# ---------------------------------------------------------------------------
# 4. Recovery Action Simulation Endpoints
# ---------------------------------------------------------------------------
@app.post("/api/recover/{transaction_id}")
def recover_transaction(transaction_id: str, body: Optional[ManualActionRequest] = None):
    """Simulate smart retry recovery action on a failed transaction."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions WHERE transaction_id = ?", (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    txn = dict(row)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Enforce maximum retry guardrail
    max_retries = int(get_setting("max_retries", "3"))
    if txn["retry_count"] >= max_retries:
        conn.close()
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "message": f"Retry limit reached ({txn['retry_count']}/{max_retries}). Action blocked by safety guardrails."
            }
        )
        
    # Smart retry simulation based on true recovery probability
    analysis = DecisionEngine.evaluate_transaction(txn)
    p_rec = analysis["recovery_probability"]
    
    # Simulation outcome: Succeed if probability >= 0.40 in demo simulation
    is_success = p_rec >= 0.35
    new_status = "Recovered" if is_success else "Failed"
    new_retry_count = txn["retry_count"] + 1
    rec_amount = txn["amount"] if is_success else 0.0
    
    cursor.execute("""
    UPDATE transactions
    SET payment_status = ?, is_recovered = ?, retry_count = ?,
        recovered_amount = ?, recovery_status = ?, last_updated = ?
    WHERE transaction_id = ?
    """, (
        new_status, 1 if is_success else 0, new_retry_count,
        rec_amount, "Recovered" if is_success else "Retry Failed", now_str, transaction_id
    ))
    
    # Insert recovery action record
    cursor.execute("""
    INSERT INTO recovery_actions (transaction_id, action_type, channel, status, trigger_type, details, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        transaction_id, "Smart Retry", "Razorpay Smart Retry Engine",
        "Success" if is_success else "Failed", "AI Recovery Agent",
        f"Smart retry simulated with {p_rec:.1%} recovery probability.", now_str
    ))
    
    # Write Audit Log
    cursor.execute("""
    INSERT INTO audit_logs (timestamp, transaction_id, event_type, decision, reason, previous_status, new_status, actor, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        now_str, transaction_id, "SMART_RETRY_EXECUTED",
        f"Smart Retry {'Succeeded' if is_success else 'Unsuccessful'}",
        f"ML Recovery Prob: {p_rec:.1%}. Reason: {txn['failure_reason']}. Retry attempt #{new_retry_count}.",
        txn["payment_status"], new_status, "AI Recovery Agent", "Razorpay Retry Engine"
    ))
    
    conn.commit()
    conn.close()
    
    return {
        "status": "success",
        "outcome": "Recovered" if is_success else "Failed",
        "transaction_id": transaction_id,
        "recovered_amount": rec_amount,
        "new_retry_count": new_retry_count,
        "message": f"Smart Retry simulated successfully. Outcome: {new_status} (Amount: ₹{rec_amount:,.2f})"
    }


@app.post("/api/remind/{transaction_id}")
def send_reminder(transaction_id: str, body: Optional[ManualActionRequest] = None):
    """Simulate dispatching a personalized 1-click WhatsApp/SMS recovery reminder."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions WHERE transaction_id = ?", (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    txn = dict(row)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Mark as recovered via reminder for interactive demo
    cursor.execute("""
    UPDATE transactions
    SET payment_status = 'Recovered', is_recovered = 1, recovered_amount = amount,
        recovery_status = 'Recovered via Reminder', recovery_action = 'Send personalized recovery reminder',
        last_updated = ?
    WHERE transaction_id = ?
    """, (now_str, transaction_id))
    
    # Record Recovery Action
    cursor.execute("""
    INSERT INTO recovery_actions (transaction_id, action_type, channel, status, trigger_type, details, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        transaction_id, "Customer Reminder", "WhatsApp / SMS API", "Delivered & Paid",
        "AI Recovery Agent", f"1-click UPI recovery link sent to {txn['customer_phone']}.", now_str
    ))
    
    # Write Audit Log
    cursor.execute("""
    INSERT INTO audit_logs (timestamp, transaction_id, event_type, decision, reason, previous_status, new_status, actor, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        now_str, transaction_id, "CUSTOMER_REMINDER_SENT", "1-Click WhatsApp Link Dispatched",
        f"Customer abandoned checkout for ₹{txn['amount']:,.2f}. Reminder sent with instant UPI intent link.",
        txn["payment_status"], "Recovered", "AI Recovery Agent", "WhatsApp Business API"
    ))
    
    conn.commit()
    conn.close()
    
    return {
        "status": "success",
        "transaction_id": transaction_id,
        "message": f"Personalized recovery reminder dispatched to {txn['customer_name']}. Payment recovered via 1-click link!"
    }


@app.post("/api/escalate/{transaction_id}")
def escalate_transaction(transaction_id: str, body: Optional[ManualActionRequest] = None):
    """Escalate transaction to support team or VIP desk."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions WHERE transaction_id = ?", (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    txn = dict(row)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    cursor.execute("""
    UPDATE transactions
    SET recovery_status = 'Escalated to Support', recovery_action = 'Escalate to support', last_updated = ?
    WHERE transaction_id = ?
    """, (now_str, transaction_id))
    
    cursor.execute("""
    INSERT INTO audit_logs (timestamp, transaction_id, event_type, decision, reason, previous_status, new_status, actor, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        now_str, transaction_id, "MANUAL_ESCALATION", "Escalated to Support Desk",
        f"High risk or complex failure ({txn['failure_reason']}). Manual outreach ticket created.",
        txn["payment_status"], txn["payment_status"], "Support Operations", "Zendesk / Razorpay Desk"
    ))
    
    conn.commit()
    conn.close()
    
    return {
        "status": "success",
        "transaction_id": transaction_id,
        "message": f"Transaction {transaction_id} escalated to Support Operations ticket queue."
    }


@app.post("/api/stop/{transaction_id}")
def stop_recovery(transaction_id: str, body: Optional[ManualActionRequest] = None):
    """Permanently stop automatic retries to save merchant fees."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions WHERE transaction_id = ?", (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    txn = dict(row)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    cursor.execute("""
    UPDATE transactions
    SET recovery_status = 'Retries Halted', recovery_action = 'Stop further retries', last_updated = ?
    WHERE transaction_id = ?
    """, (now_str, transaction_id))
    
    cursor.execute("""
    INSERT INTO audit_logs (timestamp, transaction_id, event_type, decision, reason, previous_status, new_status, actor, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        now_str, transaction_id, "RETRIES_HALTED", "Retries Permanently Stopped",
        "Guardrail: Retries terminated to prevent merchant card network penalties.",
        txn["payment_status"], txn["payment_status"], "AI Safety Guardrail", "System Policy"
    ))
    
    conn.commit()
    conn.close()
    
    return {
        "status": "success",
        "transaction_id": transaction_id,
        "message": f"Automatic retries permanently halted for {transaction_id}. Merchant fees protected."
    }


# ---------------------------------------------------------------------------
# 5. Audit Logs Endpoint
# ---------------------------------------------------------------------------
@app.get("/api/audit-logs")
def get_audit_logs(limit: int = 50, offset: int = 0, transaction_id: Optional[str] = None):
    """Retrieve full explainability audit log ledger."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM audit_logs"
    params = []
    if transaction_id:
        query += " WHERE transaction_id = ?"
        params.append(transaction_id)
        
    query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    cursor.execute(query, params)
    logs = [dict(r) for r in cursor.fetchall()]
    
    cursor.execute("SELECT COUNT(*) FROM audit_logs")
    total = cursor.fetchone()[0]
    conn.close()
    
    return {
        "total": total,
        "logs": logs
    }


# ---------------------------------------------------------------------------
# 6. ML Model Metrics Endpoint
# ---------------------------------------------------------------------------
@app.get("/api/model-metrics")
def get_model_metrics():
    """Retrieve ML training metrics, confusion matrix, and feature importances."""
    if not os.path.exists(METRICS_FILE):
        from backend.ml_model import train_and_evaluate
        train_and_evaluate()
        
    with open(METRICS_FILE, "r") as f:
        metrics = json.load(f)
        
    return metrics


# ---------------------------------------------------------------------------
# 7. System Settings Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/settings")
def get_settings():
    """Retrieve system configuration settings."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM system_settings")
    settings = {r["key"]: {"value": r["value"], "description": r["description"]} for r in cursor.fetchall()}
    conn.close()
    return settings


@app.post("/api/settings")
def update_system_setting(setting: SettingUpdate):
    """Update a system configuration setting."""
    update_setting(setting.key, setting.value)
    return {"status": "success", "key": setting.key, "value": setting.value}


# ---------------------------------------------------------------------------
# 8. Demo Scenarios Endpoints
# ---------------------------------------------------------------------------
DEMO_SCENARIOS = [
    {
        "id": "scenario_1",
        "title": "Scenario 1: Temporary Bank Failure -> Smart Retry",
        "description": "Simulates a transient bank timeout for a returning customer. The AI detects high recovery probability (85%+) and queues a smart retry with exponential backoff.",
        "transaction_id": "TXN_DEMO_01",
        "customer_name": "Aarav Sharma",
        "amount": 2499.0,
        "failure_reason": "Temporary bank failure",
        "expected_action": "Smart Retry payment"
    },
    {
        "id": "scenario_2",
        "title": "Scenario 2: Abandoned Checkout -> 1-Click Reminder",
        "description": "Simulates a customer dropping off mid-checkout. Instead of retrying the card, the AI dispatches a personalized WhatsApp message with an instant UPI link.",
        "transaction_id": "TXN_DEMO_02",
        "customer_name": "Priya Patel",
        "amount": 4200.0,
        "failure_reason": "Customer abandoned checkout",
        "expected_action": "Send 1-Click WhatsApp Recovery Link"
    },
    {
        "id": "scenario_3",
        "title": "Scenario 3: Retry Limit Exceeded -> Merchant Guardrail",
        "description": "Simulates a transaction that has already failed 3 times. The AI activates safety guardrails, halts blind retries to save merchant fees, and escalates to support.",
        "transaction_id": "TXN_DEMO_03",
        "customer_name": "Karan Malhotra",
        "amount": 1850.0,
        "failure_reason": "Insufficient funds",
        "expected_action": "Stop further retries & Escalate"
    },
    {
        "id": "scenario_4",
        "title": "Scenario 4: High-Value VIP Transaction -> Concierge Support",
        "description": "Simulates an enterprise high-value payment (₹65,000) failing due to bank decline. The AI routes it immediately to VIP Support Concierge.",
        "transaction_id": "TXN_DEMO_04",
        "customer_name": "Meera Joshi",
        "amount": 65000.0,
        "failure_reason": "Bank decline",
        "expected_action": "VIP Priority Concierge Recovery"
    }
]


@app.get("/api/demo-scenarios")
def list_demo_scenarios():
    """List available interactive demo pitch scenarios."""
    return DEMO_SCENARIOS


@app.post("/api/demo-scenarios/{scenario_id}/run")
def run_demo_scenario(scenario_id: str):
    """Inject and evaluate a live pitch demo scenario into the system."""
    scenario = next((s for s in DEMO_SCENARIOS if s["id"] == scenario_id), None)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Define scenario properties
    if scenario_id == "scenario_1":
        retry_count = 0
        prev_s, prev_f = 8, 1
        c_type = "Returning"
    elif scenario_id == "scenario_2":
        retry_count = 0
        prev_s, prev_f = 3, 0
        c_type = "Returning"
    elif scenario_id == "scenario_3":
        retry_count = 3  # Hit max retries
        prev_s, prev_f = 1, 4
        c_type = "New"
    else:  # scenario_4
        retry_count = 0
        prev_s, prev_f = 15, 1
        c_type = "VIP"
        
    txn_data = {
        "transaction_id": scenario["transaction_id"],
        "customer_id": f"CUST_DEMO_{scenario_id[-2:]}",
        "customer_name": scenario["customer_name"],
        "customer_email": f"{scenario['customer_name'].lower().replace(' ', '.')}@example.com",
        "customer_phone": "+91 9876543210",
        "customer_type": c_type,
        "amount": scenario["amount"],
        "currency": "INR",
        "payment_method": "UPI" if scenario_id in ["scenario_1", "scenario_2"] else "Credit Card",
        "payment_status": "Failed",
        "failure_reason": scenario["failure_reason"],
        "previous_successful_payments": prev_s,
        "previous_failed_payments": prev_f,
        "retry_count": retry_count,
        "time_since_failure_mins": 10,
        "transaction_date": now_str,
        "true_recovery_probability": 0.85 if scenario_id == "scenario_1" else 0.55 if scenario_id == "scenario_2" else 0.15,
        "is_recovered": 0,
        "recovery_status": "Pending Recovery",
        "recovery_action": "Pending AI Evaluation",
        "recovered_amount": 0.0,
        "risk_level": "Low" if scenario_id == "scenario_1" else "High" if scenario_id == "scenario_3" else "Medium",
        "ai_recommendation": None,
        "ai_reasoning": None,
        "last_updated": now_str
    }
    
    # Upsert transaction
    cursor.execute("""
    INSERT OR REPLACE INTO transactions (
        transaction_id, customer_id, customer_name, customer_email, customer_phone,
        customer_type, amount, currency, payment_method, payment_status, failure_reason,
        previous_successful_payments, previous_failed_payments, retry_count,
        time_since_failure_mins, transaction_date, true_recovery_probability,
        is_recovered, recovery_status, recovery_action, recovered_amount,
        risk_level, ai_recommendation, ai_reasoning, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        txn_data["transaction_id"], txn_data["customer_id"], txn_data["customer_name"], txn_data["customer_email"],
        txn_data["customer_phone"], txn_data["customer_type"], txn_data["amount"], txn_data["currency"],
        txn_data["payment_method"], txn_data["payment_status"], txn_data["failure_reason"],
        txn_data["previous_successful_payments"], txn_data["previous_failed_payments"], txn_data["retry_count"],
        txn_data["time_since_failure_mins"], txn_data["transaction_date"], txn_data["true_recovery_probability"],
        txn_data["is_recovered"], txn_data["recovery_status"], txn_data["recovery_action"], txn_data["recovered_amount"],
        txn_data["risk_level"], txn_data["ai_recommendation"], txn_data["ai_reasoning"], txn_data["last_updated"]
    ))
    
    # Run Decision Engine
    analysis = DecisionEngine.evaluate_transaction(txn_data)
    
    cursor.execute("""
    UPDATE transactions
    SET ai_recommendation = ?, ai_reasoning = ?, risk_level = ?, recovery_action = ?
    WHERE transaction_id = ?
    """, (analysis["recommended_action"], analysis["reason"], analysis["risk_level"], analysis["recommended_action"], scenario["transaction_id"]))
    
    # Write Audit Log
    cursor.execute("""
    INSERT INTO audit_logs (timestamp, transaction_id, event_type, decision, reason, previous_status, new_status, actor, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        now_str, scenario["transaction_id"], "DEMO_SCENARIO_INJECTED",
        analysis["recommended_action"], analysis["reason"], "Failed", "Pending Recovery", "Demo Engine", "Presentation Runner"
    ))
    
    conn.commit()
    conn.close()
    
    return {
        "status": "success",
        "scenario": scenario,
        "analysis": analysis,
        "transaction": txn_data
    }


# ---------------------------------------------------------------------------
# Mount Static Frontend
# ---------------------------------------------------------------------------
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/")
def serve_root():
    """Serve frontend index.html."""
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "PayRecover AI API is running. Build frontend in /frontend directory."}
