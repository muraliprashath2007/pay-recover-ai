"""
PayRecover AI - AI Decision Engine
===================================
Combines Machine Learning prediction with business rules, risk scoring,
and hard safety guardrails to select explainable recovery actions.

Guardrails:
-----------
1. Maximum Retry Count: Halts automatic retries after N attempts (default 3) to protect merchant fees.
2. High Value VIP Routing: Transactions >= ₹25,000 flagged for Concierge/Support review.
3. Explicit Explainability: Every decision produces a plain-English reason and next step.
4. Channel Optimization: Directs action to appropriate channel (Smart Retry, WhatsApp, SMS, Support Desk).
"""

from datetime import datetime
from backend.ml_model import RecoveryPredictor
from backend.database import get_setting

# Lazy loaded predictor singleton
_predictor = None

def get_predictor():
    global _predictor
    if _predictor is None:
        _predictor = RecoveryPredictor()
    return _predictor


class DecisionEngine:
    """Intelligent revenue recovery decision engine."""
    
    @classmethod
    def evaluate_transaction(cls, txn: dict) -> dict:
        """
        Evaluate a transaction and return an explainable recovery recommendation.
        """
        txn_id = txn.get("transaction_id", "UNKNOWN")
        amount = float(txn.get("amount", 0.0))
        failure_reason = txn.get("failure_reason", "Temporary bank failure")
        retry_count = int(txn.get("retry_count", 0))
        customer_name = txn.get("customer_name", "Customer")
        customer_type = txn.get("customer_type", "Returning")
        prev_success = int(txn.get("previous_successful_payments", 0))
        prev_failed = int(txn.get("previous_failed_payments", 0))
        
        # 1. Fetch system guardrail settings
        try:
            max_retries = int(get_setting("max_retries", "3"))
            high_value_threshold = float(get_setting("high_value_amount", "25000"))
            high_risk_threshold = float(get_setting("high_risk_threshold", "0.40"))
        except Exception:
            max_retries = 3
            high_value_threshold = 25000.0
            high_risk_threshold = 0.40
            
        # 2. Run ML Model Prediction
        predictor = get_predictor()
        ml_result = predictor.predict_transaction(txn)
        p_rec = ml_result["recovery_probability"]
        p_pct = ml_result["recovery_percentage"]
        confidence = ml_result["confidence_score"]
        risk_level = ml_result["risk_level"]
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # 3. Apply Guardrails & Decision Rules
        
        # GUARDRAIL 1: Hard Retry Limit Exceeded
        if retry_count >= max_retries:
            return {
                "transaction_id": txn_id,
                "customer_name": customer_name,
                "amount": amount,
                "failure_reason": failure_reason,
                "recovery_probability": p_rec,
                "recovery_percentage": p_pct,
                "confidence_score": confidence,
                "risk_level": "High",
                "recommended_action": "Stop further retries & Escalate",
                "action_code": "STOP_AND_ESCALATE",
                "is_retry_allowed": False,
                "retry_count": retry_count,
                "max_retries": max_retries,
                "suggested_channel": "Support Desk",
                "reason": (
                    f"Retry limit reached ({retry_count}/{max_retries} attempts). "
                    "Automatic retries stopped to prevent additional merchant gateway charges and card network fatigue."
                ),
                "next_step": "Customer support team alerted for manual outreach.",
                "timestamp": timestamp,
                "audit_note": f"Retry limit guardrail enforced for {txn_id}."
            }
            
        # GUARDRAIL 2: High-Value VIP Transaction Protection
        if amount >= high_value_threshold and customer_type in ["VIP", "Enterprise"]:
            return {
                "transaction_id": txn_id,
                "customer_name": customer_name,
                "amount": amount,
                "failure_reason": failure_reason,
                "recovery_probability": p_rec,
                "recovery_percentage": p_pct,
                "confidence_score": confidence,
                "risk_level": "Low" if p_rec >= 0.60 else "Medium",
                "recommended_action": "VIP Priority Concierge Recovery",
                "action_code": "VIP_CONCIERGE",
                "is_retry_allowed": True,
                "retry_count": retry_count,
                "max_retries": max_retries,
                "suggested_channel": "Dedicated Account Manager / WhatsApp VIP",
                "reason": (
                    f"High-value {customer_type} transaction (₹{amount:,.2f}) with strong customer track record. "
                    f"ML predicts {p_pct}% recovery likelihood."
                ),
                "next_step": "Send priority payment link via WhatsApp and notify VIP account manager.",
                "timestamp": timestamp,
                "audit_note": f"VIP concierge routing applied for ₹{amount:,.2f} transaction."
            }
            
        # RULE 3: Customer Abandoned Checkout
        if failure_reason == "Customer abandoned checkout":
            return {
                "transaction_id": txn_id,
                "customer_name": customer_name,
                "amount": amount,
                "failure_reason": failure_reason,
                "recovery_probability": p_rec,
                "recovery_percentage": p_pct,
                "confidence_score": confidence,
                "risk_level": "Low" if p_rec >= 0.60 else "Medium",
                "recommended_action": "Send 1-Click WhatsApp Recovery Link",
                "action_code": "SEND_REMINDER",
                "is_retry_allowed": True,
                "retry_count": retry_count,
                "max_retries": max_retries,
                "suggested_channel": "WhatsApp API",
                "reason": (
                    "Customer dropped off before completing checkout. "
                    "Sending a pre-filled 1-click Razorpay payment link recovers ~60% of abandoned carts."
                ),
                "next_step": "Dispatch interactive WhatsApp message with instant UPI intent link.",
                "timestamp": timestamp,
                "audit_note": "Abandoned cart recovery link triggered."
            }
            
        # RULE 4: Permanent / Hard Card Failures (Expired Card / Bank Decline)
        if failure_reason in ["Expired card", "Bank decline"]:
            return {
                "transaction_id": txn_id,
                "customer_name": customer_name,
                "amount": amount,
                "failure_reason": failure_reason,
                "recovery_probability": p_rec,
                "recovery_percentage": p_pct,
                "confidence_score": confidence,
                "risk_level": "High",
                "recommended_action": "Request Alternative Payment Method (UPI / Netbanking)",
                "action_code": "UPDATE_PAYMENT_METHOD",
                "is_retry_allowed": False,
                "retry_count": retry_count,
                "max_retries": max_retries,
                "suggested_channel": "SMS & Email Prompt",
                "reason": (
                    f"Direct retry will fail due to {failure_reason.lower()}. "
                    "Customer must provide a valid card or switch to UPI / Netbanking."
                ),
                "next_step": "Prompt user via SMS/Email to select an alternative payment method.",
                "timestamp": timestamp,
                "audit_note": f"Alternative payment method requested due to {failure_reason}."
            }
            
        # RULE 5: Insufficient Funds
        if failure_reason == "Insufficient funds":
            return {
                "transaction_id": txn_id,
                "customer_name": customer_name,
                "amount": amount,
                "failure_reason": failure_reason,
                "recovery_probability": p_rec,
                "recovery_percentage": p_pct,
                "confidence_score": confidence,
                "risk_level": "Medium",
                "recommended_action": "Schedule Delayed Payment Reminder",
                "action_code": "SCHEDULE_REMINDER",
                "is_retry_allowed": True,
                "retry_count": retry_count,
                "max_retries": max_retries,
                "suggested_channel": "WhatsApp / SMS",
                "reason": (
                    "Insufficient balance reported by issuing bank. "
                    "Immediate retry will fail; scheduled reminder in 4 hours or next morning is optimal."
                ),
                "next_step": "Schedule reminder notification for optimal fund replenishment window.",
                "timestamp": timestamp,
                "audit_note": "Scheduled reminder set for insufficient funds."
            }
            
        # RULE 6: Technical / Gateway / Network / Timeout Glitch + High Recovery Probability
        if p_rec >= 0.65 and retry_count < max_retries:
            backoff_mins = 15 * (2 ** retry_count) # 15m, 30m, 60m
            return {
                "transaction_id": txn_id,
                "customer_name": customer_name,
                "amount": amount,
                "failure_reason": failure_reason,
                "recovery_probability": p_rec,
                "recovery_percentage": p_pct,
                "confidence_score": confidence,
                "risk_level": "Low",
                "recommended_action": f"Smart Retry in {backoff_mins} mins (Optimal Backoff)",
                "action_code": "RETRY_PAYMENT",
                "is_retry_allowed": True,
                "retry_count": retry_count,
                "max_retries": max_retries,
                "suggested_channel": "Razorpay Smart Retry Engine",
                "reason": (
                    f"Temporary technical issue ({failure_reason}) with high recovery probability ({p_pct}%). "
                    f"Customer has {prev_success} successful past payments. Exponential backoff avoids bank rate limits."
                ),
                "next_step": f"Queue automated background retry in {backoff_mins} minutes.",
                "timestamp": timestamp,
                "audit_note": f"Automated smart retry queued with {backoff_mins}m backoff."
            }
            
        # RULE 7: Moderate Recovery Probability
        if p_rec >= high_risk_threshold:
            return {
                "transaction_id": txn_id,
                "customer_name": customer_name,
                "amount": amount,
                "failure_reason": failure_reason,
                "recovery_probability": p_rec,
                "recovery_percentage": p_pct,
                "confidence_score": confidence,
                "risk_level": "Medium",
                "recommended_action": "Send Interactive Payment Reminder",
                "action_code": "SEND_REMINDER",
                "is_retry_allowed": True,
                "retry_count": retry_count,
                "max_retries": max_retries,
                "suggested_channel": "WhatsApp / SMS",
                "reason": (
                    f"Moderate recovery probability ({p_pct}%). "
                    "Customer reminder is safer and more effective than direct headless retry."
                ),
                "next_step": "Send payment link with multiple payment mode options.",
                "timestamp": timestamp,
                "audit_note": "Interactive reminder dispatched."
            }
            
        # DEFAULT: High Risk / Low Probability
        return {
            "transaction_id": txn_id,
            "customer_name": customer_name,
            "amount": amount,
            "failure_reason": failure_reason,
            "recovery_probability": p_rec,
            "recovery_percentage": p_pct,
            "confidence_score": confidence,
            "risk_level": "High",
            "recommended_action": "Escalate for Manual Support Review",
            "action_code": "ESCALATE_TO_SUPPORT",
            "is_retry_allowed": False,
            "retry_count": retry_count,
            "max_retries": max_retries,
            "suggested_channel": "Support Desk",
            "reason": (
                f"Low recovery probability ({p_pct}%) with elevated risk profile. "
                "Halting automated retries to avoid unnecessary payment gateway charges."
            ),
            "next_step": "Flag in merchant recovery dashboard for manual review.",
            "timestamp": timestamp,
            "audit_note": "Transaction escalated to manual review."
        }
