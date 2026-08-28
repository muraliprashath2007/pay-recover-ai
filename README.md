# 🛡️ PayRecover AI – Intelligent Payment Recovery Agent

> **Submission for Razorpay AI Builder Internship 2026 – Track 3: AI Revenue Recovery**  
> *"Turning failed payments into intelligent, explainable recovery opportunities."*

---

## 1. Problem Statement

In Indian digital commerce, **5% to 15% of payment attempts fail** due to transient bank declines, network timeouts, gateway glitches, insufficient balances, or checkout drop-offs.

The conventional merchant response is **"dumb blind retries"**:
1. **Merchant Penalties:** Retrying indiscriminately triggers additional gateway fees per attempt.
2. **Card Network Fatigue:** Card networks (Visa, Mastercard, RuPay) flag repeated failed attempts, risking merchant terminal blacklisting.
3. **Customer Frustration:** Repeated card debit attempts without communication erode buyer trust.

---

## 2. The Solution: PayRecover AI

**PayRecover AI** is an autonomous AI agent and decision engine that acts as a real-time revenue triage officer for Razorpay merchants.

Instead of blind retries:
1. **Root-Cause Analysis:** Identifies why the payment failed (technical timeout vs. balance vs. card expiration vs. abandoned cart).
2. **Calibrated ML Likelihood:** Predicts the probability of successful recovery based on historical transaction patterns, customer loyalty tiers, and retry history.
3. **Multi-Channel Precision Action:** Selects the optimal recovery pathway (Smart Exponential Backoff Retry, 1-Click WhatsApp Instant Checkout Link, VIP Concierge Outreach, or Hard Halt).
4. **Transparent Explainability:** Produces a plain-English explanation for every single action, logged immutably in an audit ledger.

---

## 3. Measurable Impact (Synthetic Trial)

Computed live from 1,500 synthetic payment transactions:
- 📊 **Total Processed Transactions:** 1,500
- 🚨 **Initial Failed Transactions:** 587 (39.1% failure rate)
- 💰 **Total Revenue at Risk:** ₹24,80,000+
- 🎯 **AI Recovery Rate:** **53.8%** (316 payments salvaged)
- 💵 **Total Revenue Recovered:** **₹20,72,929.73**
- 🛡️ **Gateway Fees Saved:** **₹4,740.00** (by eliminating wasteful blind retries)
- ⏱️ **Average Decision Latency:** **< 15ms**

---

## 4. System Architecture

```
+------------------------------------------------------------------------------------+
|                             PayRecover AI Architecture                             |
+------------------------------------------------------------------------------------+
|                                                                                    |
|   [ Modern React 18 Fintech Dashboard ] (Tailwind CSS, Lucide Icons, Chart.js)      |
|                                |                                                   |
|                                v  (REST API / JSON)                                |
|   [ FastAPI High-Performance Backend ] (Python 3.12, Uvicorn)                      |
|       |                                                                            |
|       +--> [ SQLite Database Layer ] (Transactions, Customers, Audit, Settings)   |
|       |                                                                            |
|       +--> [ Scikit-Learn Calibrated ML Pipeline ]                                 |
|       |        - Preprocessing: OneHotEncoder + StandardScaler                     |
|       |        - Classifier: Tuned RandomForestClassifier                          |
|       |        - Inference: Calibrated Recovery Probability Score (0% - 100%)       |
|       |                                                                            |
|       +--> [ AI Decision Engine & Safety Guardrails ]                              |
|       |        - Guardrail 1: Max Retry Limit (Halt retries >= 3)                  |
|       |        - Guardrail 2: VIP High-Value Routing (Amount >= ₹25,000)           |
|       |        - Rule 3: Technical Timeout -> Smart Exponential Backoff Retry      |
|       |        - Rule 4: Abandoned Cart -> 1-Click WhatsApp Recovery Link          |
|       |        - Rule 5: Expired Card -> Alternative Payment Method Request        |
|       |                                                                            |
|       +--> [ Autonomous Action Dispatch & Explainable Audit Ledger ]               |
+------------------------------------------------------------------------------------+
```

---

## 5. Technology Stack

- **Backend:** Python 3.12, FastAPI, Uvicorn, Pydantic, SQLite
- **Machine Learning / AI:** Scikit-Learn, Pandas, NumPy, Joblib
- **Frontend:** React 18, Tailwind CSS, Chart.js, Lucide Icons
- **Testing:** Pytest / FastAPI TestClient, Httpx

> **Note on Architecture & Deployment:** The frontend is packaged as a high-performance React 18 Single Page Application served directly by FastAPI. This ensures the entire system starts in **1 command with zero Node/npm configuration friction** on any operating system.

---

## 6. Dataset & Documented Label-Generation Formula

A realistic synthetic dataset of **1,500 payment transactions** was generated across diverse Indian payment rails (UPI, Credit Card, Debit Card, Netbanking, Wallet) and customer tiers (New, Returning, VIP, Enterprise).

### Explicit Ground-Truth Recovery Formula:
To ensure the machine learning model learns genuine predictive patterns rather than memorizing random noise or suffering from trivial label leakage:

1. **Base Recovery Rate by Failure Cause ($P_{\text{base}}$):**
   - Temporary bank failure: `0.85`
   - Payment gateway error: `0.78`
   - Network error: `0.75`
   - Timeout: `0.70`
   - Customer abandoned checkout: `0.55`
   - Insufficient funds: `0.35`
   - Bank decline: `0.25`
   - Expired card: `0.15`

2. **Customer History Ratio ($\Delta_{\text{history}}$):**
   $$R_{\text{history}} = \frac{\text{prev\_success} + 1}{\text{prev\_success} + \text{prev\_failed} + 2}$$
   $$\Delta_{\text{history}} = +0.15 \times (R_{\text{history}} - 0.5)$$

3. **Customer Tier Modifier ($\Delta_{\text{tier}}$):**
   - VIP / Enterprise: `+0.08`
   - Returning: `+0.02`
   - New Customer: `-0.04`

4. **Retry Count Penalty ($\Delta_{\text{retry}}$):**
   $$\Delta_{\text{retry}} = -0.18 \times \text{retry\_count}$$

5. **High-Value Insufficient Funds Penalty ($\Delta_{\text{amount}}$):**
   - If $\text{amount} > ₹20,000$ and reason is `Insufficient funds`: `-0.10`

6. **Bernoulli Sampling:**
   $$P_{\text{true}} = \text{clip}(P_{\text{base}} + \Delta_{\text{history}} + \Delta_{\text{tier}} + \Delta_{\text{retry}} + \Delta_{\text{amount}}, 0.05, 0.95)$$
   $$\text{is\_recovered} \sim \text{Bernoulli}(P_{\text{true}})$$

---

## 7. Machine Learning Model & Evaluation

A **RandomForestClassifier** with calibrated probability outputs was trained on failed transactions with an **80/20 Stratified Train/Test Split**.

### Evaluation Results (Holdout Test Set):
| Metric | Value | Interpretation |
|---|---|---|
| **Accuracy** | **73.73%** | Realistic predictive power (No label leakage) |
| **Precision** | **72.00%** | Minimizes wasted retry attempts |
| **Recall** | **84.38%** | Captures high volume of recoverable revenue |
| **F1-Score** | **0.7770** | Strong balance between precision and recall |
| **ROC-AUC** | **0.7694** | High discriminatory capability across risk tiers |
| **Logistic Regression Benchmark** | **71.19%** | Random Forest achieves **+2.54%** performance lift |

### Sanity Check Verification:
- **Sanity Status:** `PASSED (Healthy / Realistic Signal)`
- **Validation:** Accuracy is squarely within the target 60%–95% band. It does not overfit to trivial identifiers (which would yield >98% accuracy) and does not degrade into random coin-flipping (<60%).

---

## 8. AI Decision Engine & Safety Guardrails

| Condition / Trigger | Assessed Risk | Recommended AI Action | Execution Channel | Explainable Reason |
|---|---|---|---|---|
| Retry Count $\ge$ 3 | **High** | `Stop further retries & Escalate` | Support Desk | Halts automated retries to protect merchant from card network penalties. |
| Amount $\ge$ ₹25,000 (VIP) | **Low/Med** | `VIP Concierge Recovery` | Dedicated WhatsApp VIP | High-value customer requiring white-glove checkout assistance. |
| Temporary bank failure / Timeout | **Low** | `Smart Retry (Exponential Backoff)` | Razorpay Retry Engine | Transient network glitch; customer track record is solid. |
| Abandoned Checkout | **Medium** | `1-Click WhatsApp Recovery Link` | WhatsApp Business API | Pre-filled UPI intent link recovers drop-offs without card re-entry. |
| Expired Card / Bank Decline | **High** | `Request Alternative Payment Method` | SMS / Email Prompt | Headless retry will fail; prompts buyer to switch to UPI / Netbanking. |
| Insufficient Funds | **Medium** | `Schedule Delayed Payment Reminder` | WhatsApp / SMS | Scheduled outreach for salary/morning funds replenishment window. |

---

## 9. 5-Minute Pitch Script (Razorpay AI Builder)

```
[0:00 - 1:00] THE PROBLEM
"Good morning, Razorpay team. Indian e-commerce merchants lose up to 15% of their 
revenue at the final checkout mile. Today, most recovery systems rely on 'blind retries'—
spamming the banking rails with identical retry requests. This causes gateway fee 
penalties, card network throttling, and frustrated buyers."

[1:00 - 2:30] THE SOLUTION
"We built PayRecover AI—an intelligent recovery agent that treats every failed 
transaction as a unique recovery decision. Using a calibrated Scikit-Learn machine 
learning model, PayRecover AI analyzes the failure root-cause, customer payment history, 
and retry fatigue in under 15 milliseconds. It never retries blindly."

[2:30 - 3:45] LIVE DEMO SCENARIOS
"Let me demonstrate 4 distinct merchant scenarios in our live app:
  1. Temporary Bank Failure: The AI identifies a transient glitch and queues a 15-minute 
     smart retry with exponential backoff.
  2. Abandoned Checkout: Instead of retrying a card, it sends an interactive 1-click 
     WhatsApp UPI link directly to the customer's phone.
  3. Retry Limit Guardrail: When a transaction hits 3 failures, PayRecover AI halts 
     further retries to save merchant gateway fees.
  4. VIP High-Value Txn: A ₹65,000 transaction is escalated to VIP Concierge support."

[3:45 - 4:30] MEASURABLE IMPACT
"In our trial of 1,500 transactions, PayRecover AI recovered 53.8% of failed payments, 
salvaged ₹20.7 Lakhs in gross merchandise value, and saved ₹4,740 in gateway retry fees."

[4:30 - 5:00] SUMMARY & WRAP-UP
"PayRecover AI transforms payment failure from a dead-end loss into an explainable, 
high-conversion revenue recovery engine for Razorpay merchants. Thank you!"
```

---

## 10. API Documentation

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/dashboard` | Returns live computed KPIs, failure reason breakdowns, and recovery metrics. |
| `GET` | `/api/transactions` | Lists transactions with multi-criteria filtering (status, risk, failure reason, search). |
| `GET` | `/api/transactions/{id}` | Retrieves full transaction detail, AI analysis, and audit history. |
| `POST` | `/api/analyze/{id}` | Runs real-time ML inference and AI decision evaluation. |
| `POST` | `/api/recover/{id}` | Simulates smart retry execution with guardrail verification. |
| `POST` | `/api/remind/{id}` | Dispatches simulated 1-click WhatsApp/SMS recovery link. |
| `POST` | `/api/escalate/{id}` | Escalates transaction to Support Desk queue. |
| `POST` | `/api/stop/{id}` | Permanently halts automatic retries to save merchant fees. |
| `GET` | `/api/audit-logs` | Returns chronological explainability audit ledger. |
| `GET` | `/api/model-metrics` | Returns ML accuracy, confusion matrix, feature importances, and sanity status. |
| `GET` | `/api/demo-scenarios` | Lists the 4 interactive pitch scenarios. |
| `POST` | `/api/demo-scenarios/{id}/run` | Injects and executes an interactive demo scenario in real-time. |
| `GET/POST` | `/api/settings` | Retrieves or updates system safety guardrails (max retries, risk thresholds). |

---

## 11. Screenshots Guide

When preparing your submission or GitHub repository, include screenshots of:
1. **`dashboard_overview.png`**: Executive Dashboard showing KPI cards (53.8% Recovery Rate, ₹20.7L Recovered), Donut Chart, and Failure Breakdown.
2. **`ai_recovery_agent.png`**: AI Recovery Agent Workbench showing the Recovery Likelihood gauge, Risk badge, and Explainable Reasoning trail.
3. **`demo_scenarios.png`**: Interactive 5-Minute Demo Scenarios Runner showing the 4 scenario cards.
4. **`ml_model_metrics.png`**: Machine Learning Model Performance with Confusion Matrix and Live ML Inference Sandbox.
5. **`audit_ledger.png`**: Live Audit Log with timestamped reasoning trails.

---

## 12. Future Improvements (Production Roadmap)

1. **LLM-Powered Dynamic Messaging:** Use Gemini to generate personalized, empathetic WhatsApp recovery copy tailored to the customer's language and buying history.
2. **Dynamic Multi-Gateway Routing:** Automatically route retries through alternative acquiring banks (HDFC, ICICI, Axis) if the primary gateway is experiencing downtime.
3. **Webhook Subscriptions:** Emit real-time Webhook events (`recovery.succeeded`, `guardrail.retries_halted`) to merchant ERP systems.
4. **Predictive Churn Scoring:** Correlate repeated payment failures with customer subscription churn.

---

## 13. Quickstart & Installation Instructions

### Prerequisites
- Python 3.10+ installed

### Step-by-Step Launch:
```bash
# 1. Clone or navigate to the repository
cd d:/intern/razorpay

# 2. Install dependencies
pip install -r requirements.txt

# 3. Launch PayRecover AI (Single 1-Command Startup)
python run.py
```

### Accessing the Web Application:
Open **`http://localhost:8000`** in any modern web browser.

### Running Automated Tests:
```bash
python backend/test_api.py
```

---

## 14. Author

- **Candidate:** Razorpay AI Builder Intern Candidate (2026)
- **Track:** Track 3 – AI Revenue Recovery
- **Project:** PayRecover AI – Intelligent Payment Recovery Agent
