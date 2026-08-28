"""
PayRecover AI - SQLite Database Layer
======================================
Manages database schema, connection pooling, and automatic dataset seeding.
"""

import os
import sqlite3
import pandas as pd
from datetime import datetime

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "payrecover.db")
CSV_PATH = os.path.join(DATA_DIR, "synthetic_transactions.csv")


def get_db_connection() -> sqlite3.Connection:
    """Return a connection to the SQLite database with Row factory enabled."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(seed_from_csv: bool = True):
    """Initialize database tables and seed with synthetic transactions."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Transactions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        transaction_id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        customer_phone TEXT,
        customer_type TEXT DEFAULT 'Returning',
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'INR',
        payment_method TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        failure_reason TEXT DEFAULT 'None',
        previous_successful_payments INTEGER DEFAULT 0,
        previous_failed_payments INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        time_since_failure_mins INTEGER DEFAULT 0,
        transaction_date TEXT NOT NULL,
        true_recovery_probability REAL DEFAULT 0.0,
        is_recovered INTEGER DEFAULT 0,
        recovery_status TEXT DEFAULT 'Pending Recovery',
        recovery_action TEXT DEFAULT 'None',
        recovered_amount REAL DEFAULT 0.0,
        risk_level TEXT DEFAULT 'Low',
        ai_recommendation TEXT,
        ai_reasoning TEXT,
        last_updated TEXT
    )
    """)
    
    # 2. Customers Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customers (
        customer_id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        customer_phone TEXT,
        customer_type TEXT DEFAULT 'Returning',
        total_transactions INTEGER DEFAULT 0,
        successful_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0
    )
    """)
    
    # 3. Recovery Actions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS recovery_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        channel TEXT DEFAULT 'API',
        status TEXT DEFAULT 'Success',
        trigger_type TEXT DEFAULT 'AI Agent',
        details TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES transactions (transaction_id)
    )
    """)
    
    # 4. Audit Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT NOT NULL,
        previous_status TEXT,
        new_status TEXT,
        actor TEXT DEFAULT 'AI Recovery Agent',
        channel TEXT DEFAULT 'Automated System'
    )
    """)
    
    # 5. Model Predictions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS model_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id TEXT NOT NULL,
        recovery_probability REAL NOT NULL,
        confidence_score REAL NOT NULL,
        risk_level TEXT NOT NULL,
        predicted_at TEXT NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES transactions (transaction_id)
    )
    """)
    
    # 6. System Settings Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT
    )
    """)
    
    # Seed default settings
    default_settings = [
        ("max_retries", "3", "Maximum number of automatic recovery retries allowed per transaction"),
        ("high_risk_threshold", "0.40", "Recovery probability threshold below which transactions are flagged High Risk"),
        ("high_value_amount", "25000", "Amount in INR above which VIP manual review is triggered"),
        ("demo_mode", "true", "Demo simulation mode flag")
    ]
    for key, val, desc in default_settings:
        cursor.execute("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)", (key, val, desc))
        
    conn.commit()
    
    # Check if transactions table is empty
    cursor.execute("SELECT COUNT(*) FROM transactions")
    count = cursor.fetchone()[0]
    
    if count == 0 and seed_from_csv:
        if not os.path.exists(CSV_PATH):
            from backend.data_generator import generate_synthetic_data
            generate_synthetic_data(num_records=1500, output_csv_path=CSV_PATH)
            
        df = pd.read_csv(CSV_PATH, keep_default_na=False)
        print(f"Seeding database with {len(df)} transactions from {CSV_PATH}...")
        
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for _, row in df.iterrows():
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
                row["transaction_id"], row["customer_id"], row["customer_name"], row["customer_email"], row["customer_phone"],
                row["customer_type"], float(row["amount"]), row["currency"], row["payment_method"], row["payment_status"],
                row["failure_reason"], int(row["previous_successful_payments"]), int(row["previous_failed_payments"]),
                int(row["retry_count"]), int(row["time_since_failure_mins"]), row["transaction_date"],
                float(row["true_recovery_probability"]), int(row["is_recovered"]), row["recovery_status"],
                row["recovery_action"], float(row["recovered_amount"]), row["risk_level"],
                f"Action: {row['recovery_action']}", f"Risk: {row['risk_level']} based on failure analysis", now_str
            ))
            
            # Upsert customer
            cursor.execute("""
            INSERT INTO customers (customer_id, customer_name, customer_email, customer_phone, customer_type, total_transactions, successful_count, failed_count)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(customer_id) DO UPDATE SET
                total_transactions = total_transactions + 1,
                successful_count = successful_count + ?,
                failed_count = failed_count + ?
            """, (
                row["customer_id"], row["customer_name"], row["customer_email"], row["customer_phone"], row["customer_type"],
                1 if row["payment_status"] in ["Success", "Recovered"] else 0,
                1 if row["payment_status"] == "Failed" else 0,
                1 if row["payment_status"] in ["Success", "Recovered"] else 0,
                1 if row["payment_status"] == "Failed" else 0
            ))
            
            # Initial seed audit logs for recovered failures
            if row["failure_reason"] != "None" and row["is_recovered"] == 1:
                cursor.execute("""
                INSERT INTO audit_logs (timestamp, transaction_id, event_type, decision, reason, previous_status, new_status, actor, channel)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    row["transaction_date"], row["transaction_id"], "RECOVERY_SIMULATED",
                    row["recovery_action"], f"High probability ({row['true_recovery_probability']:.1%}) with reason: {row['failure_reason']}",
                    "Failed", "Recovered", "AI Recovery Agent", "Smart Retry Engine"
                ))
                
        conn.commit()
        print(f"Database seeded successfully with {len(df)} transactions.")
        
    conn.close()


def get_setting(key: str, default: str = "") -> str:
    """Retrieve a setting value from SQLite."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM system_settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else default


def update_setting(key: str, value: str):
    """Update a setting value in SQLite."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE system_settings SET value = ? WHERE key = ?", (value, key))
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
