"""
PayRecover AI - Synthetic Dataset Generator
============================================
Generates 1,200+ realistic payment transactions with documented recovery rules
for Razorpay AI Builder Internship 2026 - Track 3 (AI Revenue Recovery).

Documented Label-Generation Rule:
---------------------------------
For every failed payment, the ground-truth recovery probability P(Recovery) is calculated as:
  1. Base rate by failure reason:
     - Temporary bank failure:       0.85
     - Payment gateway error:        0.78
     - Network error:                0.75
     - Timeout:                      0.70
     - Customer abandoned checkout:  0.55
     - Insufficient funds:           0.35
     - Bank decline:                 0.25
     - Expired card:                 0.15
  2. Customer history modifier:
     - History ratio = (prev_success + 1) / (prev_success + prev_failed + 2)
     - Modifier = +0.15 * (History ratio - 0.5)
     - Customer Tier: VIP/Enterprise (+0.08), Returning (+0.02), New (-0.04)
  3. Retry count penalty:
     - -0.18 * retry_count (recovery probability drops with repeated failed attempts)
  4. Amount modifier:
     - High amounts (> ₹20,000) with insufficient funds: -0.10
  5. Final probability clamped to [0.05, 0.95]
  6. Binary outcome sampled from Bernoulli(P_true)
"""

import os
import random
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

# Set fixed seed for reproducibility
RANDOM_SEED = 42
random.seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)

FIRST_NAMES = [
    "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna", "Ishaan",
    "Shaurya", "Atharva", "Ananya", "Diya", "Gauri", "Anika", "Navya", "Pari", "Saanvi", "Myra",
    "Rohan", "Pooja", "Vikram", "Sneha", "Karan", "Priya", "Rahul", "Neha", "Amit", "Meera"
]

LAST_NAMES = [
    "Sharma", "Verma", "Patel", "Mehta", "Reddy", "Nair", "Iyer", "Rao", "Gupta", "Singh",
    "Kulkarni", "Deshmukh", "Chopra", "Malhotra", "Bose", "Chatterjee", "Kapoor", "Joshi", "Bhat", "Menon"
]

FAILURE_BASE_RATES = {
    "Temporary bank failure": 0.85,
    "Payment gateway error": 0.78,
    "Network error": 0.75,
    "Timeout": 0.70,
    "Customer abandoned checkout": 0.55,
    "Insufficient funds": 0.35,
    "Bank decline": 0.25,
    "Expired card": 0.15
}

PAYMENT_METHODS = ["UPI", "Credit Card", "Debit Card", "Netbanking", "Wallet"]
CUSTOMER_TYPES = ["New", "Returning", "VIP", "Enterprise"]


def generate_synthetic_data(num_records: int = 1500, output_csv_path: str = None) -> pd.DataFrame:
    records = []
    start_date = datetime.now() - timedelta(days=30)
    
    # Track customers to create realistic repeated transaction histories
    num_customers = 350
    customers = []
    for cid in range(1, num_customers + 1):
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        c_type = random.choices(CUSTOMER_TYPES, weights=[0.25, 0.55, 0.15, 0.05])[0]
        email = f"{first.lower()}.{last.lower()}{random.randint(10, 999)}@example.com"
        phone = f"+91 9{random.randint(100000000, 999999999)}"
        
        # Base payment history based on customer type
        if c_type in ["VIP", "Enterprise"]:
            base_success = random.randint(8, 30)
            base_failed = random.randint(0, 2)
        elif c_type == "Returning":
            base_success = random.randint(2, 12)
            base_failed = random.randint(0, 4)
        else: # New
            base_success = random.randint(0, 2)
            base_failed = random.randint(0, 2)
            
        customers.append({
            "customer_id": f"CUST{1000 + cid}",
            "customer_name": f"{first} {last}",
            "customer_email": email,
            "customer_phone": phone,
            "customer_type": c_type,
            "prev_success": base_success,
            "prev_failed": base_failed
        })
        
    for i in range(1, num_records + 1):
        txn_id = f"TXN{10000 + i}"
        customer = random.choice(customers)
        
        # Realistic Indian transaction amounts
        amt_tier = random.choices(["small", "medium", "large", "high_value"], weights=[0.45, 0.35, 0.15, 0.05])[0]
        if amt_tier == "small":
            amount = round(random.uniform(99.0, 999.0), 2)
        elif amt_tier == "medium":
            amount = round(random.uniform(1000.0, 4999.0), 2)
        elif amt_tier == "large":
            amount = round(random.uniform(5000.0, 19999.0), 2)
        else:
            amount = round(random.uniform(20000.0, 85000.0), 2)
            
        method = random.choices(PAYMENT_METHODS, weights=[0.45, 0.25, 0.15, 0.10, 0.05])[0]
        
        # 60% initially successful, 40% initial failed
        is_initial_fail = random.random() < 0.40
        
        # Transaction timestamp within last 30 days
        txn_time = start_date + timedelta(
            days=random.uniform(0, 30),
            hours=random.uniform(0, 23),
            minutes=random.uniform(0, 59)
        )
        
        if not is_initial_fail:
            # Clean successful payment
            records.append({
                "transaction_id": txn_id,
                "customer_id": customer["customer_id"],
                "customer_name": customer["customer_name"],
                "customer_email": customer["customer_email"],
                "customer_phone": customer["customer_phone"],
                "customer_type": customer["customer_type"],
                "amount": amount,
                "currency": "INR",
                "payment_method": method,
                "payment_status": "Success",
                "failure_reason": "None",
                "previous_successful_payments": customer["prev_success"],
                "previous_failed_payments": customer["prev_failed"],
                "retry_count": 0,
                "time_since_failure_mins": 0,
                "transaction_date": txn_time.strftime("%Y-%m-%d %H:%M:%S"),
                "true_recovery_probability": 1.0,
                "is_recovered": 1,
                "recovery_status": "Not Applicable",
                "recovery_action": "None",
                "recovered_amount": amount,
                "risk_level": "Low"
            })
            customer["prev_success"] += 1
        else:
            # Failed transaction - apply explicit documented recovery formula
            failure_reason = random.choices(
                list(FAILURE_BASE_RATES.keys()),
                weights=[0.20, 0.18, 0.15, 0.12, 0.15, 0.10, 0.06, 0.04]
            )[0]
            
            # Retry count (0 to 3)
            retry_count = random.choices([0, 1, 2, 3], weights=[0.50, 0.30, 0.15, 0.05])[0]
            time_since_fail = random.randint(5, 720) # 5 mins to 12 hours
            
            # 1. Base recovery rate
            base_p = FAILURE_BASE_RATES[failure_reason]
            
            # 2. Customer history adjustment
            prev_s = customer["prev_success"]
            prev_f = customer["prev_failed"]
            hist_ratio = (prev_s + 1) / (prev_s + prev_f + 2)
            delta_history = 0.15 * (hist_ratio - 0.5)
            
            tier_modifier = {
                "VIP": 0.08,
                "Enterprise": 0.08,
                "Returning": 0.02,
                "New": -0.04
            }[customer["customer_type"]]
            
            # 3. Retry penalty
            delta_retry = -0.18 * retry_count
            
            # 4. Amount penalty for insufficient funds
            delta_amount = -0.10 if (amount > 20000 and failure_reason == "Insufficient funds") else 0.0
            
            # 5. Calculate true recovery probability
            p_true = base_p + delta_history + tier_modifier + delta_retry + delta_amount
            p_true = float(np.clip(p_true, 0.05, 0.95))
            
            # 6. Sample Bernoulli outcome
            is_recovered = 1 if (random.random() < p_true) else 0
            
            # Risk Level Assessment
            if p_true >= 0.70 and retry_count < 2:
                risk_level = "Low"
            elif p_true >= 0.40 and retry_count <= 2:
                risk_level = "Medium"
            else:
                risk_level = "High"
                
            # Initial baseline recovery action recommendation
            if retry_count >= 3:
                rec_action = "Stop further retries"
            elif risk_level == "High" or failure_reason in ["Bank decline", "Expired card"]:
                rec_action = "Escalate to support"
            elif failure_reason == "Customer abandoned checkout":
                rec_action = "Send personalized recovery reminder"
            elif p_true >= 0.65:
                rec_action = "Smart Retry payment"
            else:
                rec_action = "Send payment reminder"
                
            status = "Recovered" if is_recovered == 1 else "Failed"
            rec_amount = amount if is_recovered == 1 else 0.0
            
            records.append({
                "transaction_id": txn_id,
                "customer_id": customer["customer_id"],
                "customer_name": customer["customer_name"],
                "customer_email": customer["customer_email"],
                "customer_phone": customer["customer_phone"],
                "customer_type": customer["customer_type"],
                "amount": amount,
                "currency": "INR",
                "payment_method": method,
                "payment_status": status,
                "failure_reason": failure_reason,
                "previous_successful_payments": prev_s,
                "previous_failed_payments": prev_f,
                "retry_count": retry_count,
                "time_since_failure_mins": time_since_fail,
                "transaction_date": txn_time.strftime("%Y-%m-%d %H:%M:%S"),
                "true_recovery_probability": round(p_true, 4),
                "is_recovered": is_recovered,
                "recovery_status": "Recovered" if is_recovered == 1 else "Pending Recovery",
                "recovery_action": rec_action,
                "recovered_amount": rec_amount,
                "risk_level": risk_level
            })
            
            if is_recovered == 1:
                customer["prev_success"] += 1
            else:
                customer["prev_failed"] += 1

    df = pd.DataFrame(records)
    
    if output_csv_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_csv_path)), exist_ok=True)
        df.to_csv(output_csv_path, index=False)
        print(f"Generated {len(df)} transactions -> Saved to {output_csv_path}")
        
    return df


if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_dir)
    data_path = os.path.join(project_root, "data", "synthetic_transactions.csv")
    df = generate_synthetic_data(num_records=1500, output_csv_path=data_path)
    
    failed_df = df[df["failure_reason"] != "None"]
    print("\nDataset Summary:")
    print(f"Total Transactions: {len(df)}")
    print(f"Initial Successful: {len(df[df['failure_reason'] == 'None'])}")
    print(f"Failed Transactions: {len(failed_df)}")
    print(f"Failed Recovered: {len(failed_df[failed_df['is_recovered'] == 1])}")
    print(f"Overall Recovery Rate for Failures: {len(failed_df[failed_df['is_recovered'] == 1]) / len(failed_df):.2%}")
    print("\nFailure Reason Distribution in Failures:")
    print(failed_df["failure_reason"].value_counts())
