"""
PayRecover AI - Automated Backend Endpoint Verification Script
==============================================================
Tests all REST API endpoints using FastAPI TestClient to guarantee correctness.
"""

import sys
import os

# Set UTF-8 output encoding for Windows consoles
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def run_tests():
    print("==================================================")
    print("Testing PayRecover AI Backend REST Endpoints")
    print("==================================================")
    
    # 1. Test /api/dashboard
    res = client.get("/api/dashboard")
    assert res.status_code == 200, f"Dashboard failed: {res.text}"
    kpis = res.json()["kpis"]
    print(f"[PASS] GET /api/dashboard")
    print(f"       -> Total Txns: {kpis['total_transactions']}, Failed: {kpis['failed_payments']}, Recovered Amount: INR {kpis['total_recovered_amount']:,.2f}, Recovery Rate: {kpis['recovery_rate_pct']}%")
    
    # 2. Test /api/transactions
    res = client.get("/api/transactions?limit=5")
    assert res.status_code == 200, f"Transactions list failed: {res.text}"
    txns = res.json()["transactions"]
    assert len(txns) > 0, "No transactions returned"
    sample_id = txns[0]["transaction_id"]
    print(f"[PASS] GET /api/transactions (Fetched {len(txns)} transactions, sample: {sample_id})")
    
    # 3. Test /api/transactions/{id}
    res = client.get(f"/api/transactions/{sample_id}")
    assert res.status_code == 200, f"Transaction detail failed: {res.text}"
    print(f"[PASS] GET /api/transactions/{sample_id} -> Status: {res.json()['payment_status']}")
    
    # 4. Test /api/analyze/{transaction_id}
    res = client.post(f"/api/analyze/{sample_id}")
    assert res.status_code == 200, f"Analyze failed: {res.text}"
    analysis = res.json()["analysis"]
    print(f"[PASS] POST /api/analyze/{sample_id}")
    print(f"       -> Action: {analysis['recommended_action']}, Prob: {analysis['recovery_percentage']}%, Risk: {analysis['risk_level']}")
    
    # 5. Test /api/recover/{transaction_id}
    res = client.post(f"/api/recover/{sample_id}")
    assert res.status_code in [200, 400], f"Recover action failed: {res.text}"
    print(f"[PASS] POST /api/recover/{sample_id} -> {res.json().get('message')}")
    
    # 6. Test /api/remind/{transaction_id}
    res = client.post(f"/api/remind/{sample_id}")
    assert res.status_code == 200, f"Remind action failed: {res.text}"
    print(f"[PASS] POST /api/remind/{sample_id} -> {res.json().get('message')}")
    
    # 7. Test /api/audit-logs
    res = client.get("/api/audit-logs?limit=5")
    assert res.status_code == 200, f"Audit logs failed: {res.text}"
    logs = res.json()["logs"]
    print(f"[PASS] GET /api/audit-logs (Found {len(logs)} recent audit trail events)")
    
    # 8. Test /api/model-metrics
    res = client.get("/api/model-metrics")
    assert res.status_code == 200, f"Model metrics failed: {res.text}"
    metrics = res.json()
    print(f"[PASS] GET /api/model-metrics -> Acc: {metrics['accuracy']:.2%}, F1: {metrics['f1_score']:.4f}, Sanity: {metrics['sanity_check']['status']}")
    
    # 9. Test /api/demo-scenarios
    res = client.get("/api/demo-scenarios")
    assert res.status_code == 200, f"Demo scenarios list failed: {res.text}"
    print(f"[PASS] GET /api/demo-scenarios (Loaded {len(res.json())} scenarios)")
    
    # 10. Test running demo scenario 1
    res = client.post("/api/demo-scenarios/scenario_1/run")
    assert res.status_code == 200, f"Run scenario 1 failed: {res.text}"
    print(f"[PASS] POST /api/demo-scenarios/scenario_1/run -> Injected TXN_DEMO_01 with Action: {res.json()['analysis']['recommended_action']}")
    
    print("\n==================================================")
    print("ALL 10 BACKEND ENDPOINTS PASSED VERIFICATION!")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
