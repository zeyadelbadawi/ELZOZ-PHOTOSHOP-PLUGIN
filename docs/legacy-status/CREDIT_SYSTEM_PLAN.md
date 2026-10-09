# ELZOZ STUDIO - PROFESSIONAL CREDIT SYSTEM PLAN

## ===== OVERVIEW =====

A complete **FREE** email-based credit management system for selling the Elzoz Studio plugin. No payment gateway needed initially—purely email-based with admin dashboard for managing client credits.

---

## ===== BUSINESS FLOW DIAGRAM =====

```
CLIENT INQUIRES
    ↓
USER (You) Tell them price: "2000 credits = $XXX"
    ↓
CLIENT PAYS (via bank transfer/PayPal/etc - outside system)
    ↓
USER gets email confirmation + CLIENT EMAIL
    ↓
USER logs into ADMIN DASHBOARD (your account)
    ↓
USER enters: client@email.com + 2000 credits
    ↓
SYSTEM creates account or adds credits
    ↓
USER downloads plugin (with encryption/license key - future)
    ↓
SENDS PLUGIN to client
    ↓
CLIENT opens plugin, sees LOGIN screen
    ↓
CLIENT enters: client@email.com
    ↓
SYSTEM verifies email + loads 2000 credits
    ↓
CLIENT sees dashboard showing: "2000 Credits Available"
    ↓
CLIENT uses plugin (each execution costs 1 credit)
    ↓
CREDITS DEDUCT in REAL TIME
    ↓
CLIENT closes plugin
    ↓
CREDITS SAVED permanently (persistence)
    ↓
CLIENT reopens plugin = same credits shown
    ↓
REPEAT until credits = 0
    ↓
When trying to execute with 0 credits:
    - ERROR: "Insufficient credits. Need 1, have 0"
    - EXECUTION BLOCKED
    - CLIENT cannot proceed
```

---

## ===== SYSTEM ARCHITECTURE =====

### 1. **AUTHENTICATION SYSTEM**

**Current Issue:** No real login system - just state in memory

**Solution:**
- Email-based login (simple, no passwords)
- Verification code via email (OTP - One Time Password)
- Session persistence in plugin storage

**Flow:**
```
User opens plugin
    ↓
No session found
    ↓
SHOW LOGIN SCREEN
    - Input: Email address
    - Button: "Send Verification Code"
    ↓
USER enters email
    ↓
SYSTEM sends code to that email (mock email service initially)
    ↓
USER enters code (seen in console logs during dev)
    ↓
SYSTEM verifies code + loads credits
    ↓
SHOW DASHBOARD with credits
    ↓
SESSION SAVED in UXP storage (persists on close/open)
```

**What Needs to Be Built:**
- Login panel component
- Email verification (mock: console log code, later use email service)
- Session management (UXP plugin storage)
- Logout functionality

---

### 2. **ADMIN DASHBOARD (Your Account)**

**Current Issue:** No way to manage client accounts

**Solution:** Admin-only interface to manage credits

**What Admin Can Do:**
1. **View all clients**
   - List of emails
   - Current credits
   - Total spent
   - Date created
   
2. **Add credits to client**
   - Input: Client email + amount
   - Button: "Add Credits"
   - Confirmation: "2000 credits added to client@email.com"
   
3. **Create new client account**
   - Input: Email
   - Input: Initial credits (e.g., 2000)
   - Button: "Create Account"
   
4. **View transaction history**
   - What actions used credits
   - When they were used
   - How many credits remaining

5. **Edit/Reset credits**
   - If client disputes, can adjust

6. **Disable account**
   - If client stops paying

**Admin Login:**
- Your special admin email: your@email.com
- Password: simple admin password
- Only you can access this

---

### 3. **CREDIT SYSTEM LOGIC**

**Current Issue:** Credits stored in memory, lost on plugin close

**Solution:** 
- Store credits in UXP plugin persistent storage
- Also sync to backend database (future)
- Check credits before every execution

**Credit Rules:**
- 1 credit = 1 design execution
- Cannot execute if credits < 1
- Credits deduct AFTER successful execution only
- No refunds for failed executions

**Credit Deduction Flow:**
```
User clicks "Execute"
    ↓
CHECK: Do they have credits?
    ↓
If NO:
    - Show error: "Need 1 credit, you have 0"
    - Block execution
    - Suggest to buy more
    
If YES:
    - Show preflight validation
    - User confirms execution
    - Start batch processing
    ↓
Processing complete successfully
    ↓
DEDUCT 1 credit from account
    ↓
SAVE to storage (persistence)
    ↓
UPDATE UI to show new balance
    ↓
Show: "Successfully processed! 1999 credits remaining"
```

---

### 4. **DATA STORAGE**

**Needed:**
- Client accounts (email, credits, date created)
- Transaction history (what was done, when, how many credits)
- Admin users (you)

**Current Storage:** All in memory (AccountContext)

**Solution - Option A (Simple):**
- Use UXP plugin's internal storage for client-side
- Use local JSON file or simple DB for admin dashboard

**Solution - Option B (Professional):**
- Use Supabase (free tier available)
  - Table: `accounts` (email, credits, created_at, status)
  - Table: `transactions` (user_id, action, credits_used, timestamp)
  - Table: `admins` (email, password_hash, role)

**Recommendation:** Option B (Supabase) - more scalable, better for future

---

## ===== COMPONENTS NEEDED =====

### **NEW COMPONENTS:**

1. **`components/LoginScreen.jsx`**
   - Email input
   - OTP input
   - "Send Code" button
   - "Verify & Login" button
   - Loading states

2. **`components/AdminDashboard.jsx`**
   - Admin-only interface
   - List of all clients
   - Add credits form
   - Create account form
   - Transaction history table
   - Usage analytics

3. **`components/CreditStatus.jsx`**
   - Display current credits (replaces current AccountManager partially)
   - Show credit usage
   - Show if credits running low

4. **`components/CreditWarning.jsx`**
   - Show when credits < 5
   - Suggest to buy more

### **MODIFIED COMPONENTS:**

1. **`AppContainer.jsx`**
   - Check if user is logged in
   - If not logged in: show LoginScreen instead of main app
   - If admin user: show AdminDashboard option in header

2. **`ExecutePanel.jsx`**
   - Check credits BEFORE showing execute button
   - Disable execute button if credits < 1
   - Show credit cost preview
   - Deduct credits on success
   - Show remaining credits after execution

3. **`AccountManager.jsx` → `AccountStatus.jsx`**
   - Simplified to just show: Email + Credits + Logout button
   - More compact and clean

---

## ===== FILE CHANGES SUMMARY =====

### **NEW FILES TO CREATE (4):**
```
src/components/LoginScreen.jsx (200 lines)
src/components/AdminDashboard.jsx (400 lines)
src/components/CreditStatus.jsx (150 lines)
src/components/CreditWarning.jsx (100 lines)
src/services/AuthService.js (200 lines)
src/services/CreditService.js (300 lines)
```

### **FILES TO MODIFY (3):**
```
src/components/AppContainer.jsx (+50 lines for login check)
src/panels/ExecutePanel.jsx (+30 lines for credit check)
src/context/AccountContext.jsx (+100 lines for credit management)
```

### **NEW CONTEXT (1):**
```
src/context/AuthContext.jsx (150 lines)
```

### **NEW DATABASE INTEGRATION (Optional but Recommended):**
```
Supabase setup with 3 tables
```

---

## ===== STEP-BY-STEP IMPLEMENTATION PLAN =====

### **PHASE 1: Core Authentication (2-3 hours)**
1. Create AuthContext for login state
2. Build LoginScreen component
3. Add mock email verification (console logs code)
4. Create session persistence in UXP storage

### **PHASE 2: Credit System (2-3 hours)**
1. Create CreditService for credit logic
2. Update AccountContext to manage credits
3. Add credit check to ExecutePanel
4. Add credit deduction logic

### **PHASE 3: Admin Dashboard (3-4 hours)**
1. Build AdminDashboard component
2. Create admin account management
3. Add client management functions
4. Add transaction history view

### **PHASE 4: UI Integration (2 hours)**
1. Update AppContainer with login flow
2. Update ExecutePanel with credit checks
3. Add CreditStatus display
4. Add CreditWarning component

### **PHASE 5: Database (1-2 hours, if using Supabase)**
1. Set up Supabase project
2. Create tables
3. Connect backend services
4. Test persistence

---

## ===== ADMIN DASHBOARD WORKFLOW =====

**You (admin) log in:**
```
URL: http://localhost/admin
Email: your@email.com
Password: admin123 (hardcoded for now)
```

**Screen shows:**
```
┌─────────────────────────────────────────┐
│ ADMIN DASHBOARD - Elzoz Studio          │
├─────────────────────────────────────────┤
│                                         │
│ QUICK ACTIONS:                          │
│ [+ Add Credits]  [+ New Account]        │
│                                         │
│ ALL CLIENTS:                            │
│ ┌─────────────────────────────────────┐ │
│ │ Email          │ Credits │ Spent     │ │
│ ├─────────────────────────────────────┤ │
│ │ client1@...    │ 1500   │ 500       │ │
│ │ client2@...    │ 0      │ 2000      │ │
│ │ client3@...    │ 2000   │ 0         │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ADD CREDITS:                            │
│ Email: [              ]                 │
│ Amount: [      ]                        │
│ [Add Credits]                           │
│                                         │
│ TRANSACTION LOG:                        │
│ client1@... executed batch (1 credit)   │
│ client2@... executed batch (1 credit)   │
│                                         │
└─────────────────────────────────────────┘
```

---

## ===== LOGIN FLOW FOR CLIENTS =====

**First Time:**
```
┌──────────────────────────────┐
│ ELZOZ STUDIO LOGIN           │
├──────────────────────────────┤
│                              │
│ Email:                       │
│ [client@email.com________]   │
│                              │
│ [Send Verification Code]     │
│                              │
└──────────────────────────────┘

↓ (After clicking button)

┌──────────────────────────────┐
│ CHECK YOUR EMAIL             │
├──────────────────────────────┤
│                              │
│ We sent a code to:           │
│ client@email.com             │
│                              │
│ Enter code:                  │
│ [_ _ _ _ _ _]                │
│                              │
│ [Verify & Login]             │
│                              │
└──────────────────────────────┘

↓ (After entering code)

┌──────────────────────────────┐
│ WELCOME!                     │
│ client@email.com             │
│                              │
│ ✅ Credits: 2000             │
│                              │
│ [Continue to App]            │
└──────────────────────────────┘
```

**Next Time:**
```
Plugin opens
↓
Check: Is session saved?
↓
YES → Skip login, show dashboard
NO → Show login screen
```

---

## ===== CREDIT EXECUTION FLOW =====

**Before Execution:**
```
User clicks "Run Preflight Check"
↓
CHECK: Do they have >= 1 credit?
↓
NO:
  ❌ Show: "Insufficient Credits"
  ❌ Message: "Need 1 credit, you have 0"
  ❌ Disable Execute button
  ✨ Suggest: "Contact admin to purchase credits"
  
YES:
  ✅ Show preflight report normally
  ✅ Enable Execute button
  ✅ Display: "This will use 1 credit. Current: 2000"
```

**After Successful Execution:**
```
Batch processing complete
↓
DEDUCT 1 credit
↓
Update: 2000 → 1999
↓
SAVE to storage
↓
Show message: "Successfully processed! 1999 credits remaining"
```

**If Execution Fails:**
```
Batch has errors
↓
DO NOT deduct credits
↓
Show message: "Execution failed - no credits used"
```

---

## ===== SECURITY CONSIDERATIONS =====

**Current:** None - but for MVP, acceptable

**Important Notes:**
1. **No password needed** - Email-based OTP is simpler and good enough for this use case
2. **Admin access** - Hardcoded admin email/password for now (you only)
3. **Data encryption** - Can add later when using Supabase
4. **Credit tampering** - Cannot tamper (stored server-side if using Supabase)

**Future Security (Phase 2):**
- Add password option
- API key for programmatic credit checks
- Webhook for payment integration
- Email verification before account activation

---

## ===== PACKAGE DEPENDENCIES NEEDED =====

**For implementation:**
```
nodemailer (send verification emails)
```

**Optional (if using Supabase):**
```
@supabase/supabase-js
```

**Already installed:**
```
lucide-react (icons)
react (components)
photoshop (UXP integration)
```

---

## ===== DATABASE SCHEMA (If Using Supabase) =====

### **Table: `accounts`**
```sql
- id (UUID, primary key)
- email (TEXT, unique)
- credits (INTEGER)
- total_spent (INTEGER)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- status (TEXT: 'active' | 'suspended')
```

### **Table: `transactions`**
```sql
- id (UUID, primary key)
- user_id (UUID, foreign key → accounts.id)
- action (TEXT: 'execute_batch', 'refund', 'manual_add')
- credits_used (INTEGER)
- credits_before (INTEGER)
- credits_after (INTEGER)
- timestamp (TIMESTAMP)
- details (JSON)
```

### **Table: `admins`**
```sql
- id (UUID, primary key)
- email (TEXT, unique)
- password_hash (TEXT)
- role (TEXT: 'owner', 'support')
- created_at (TIMESTAMP)
```

---

## ===== WHAT I RECOMMEND =====

### **APPROACH:**

**Option A: Simple (Free, No Database)**
- Pros: 
  - Free
  - No external dependencies
  - Quick implementation
  - Good for testing
- Cons:
  - Can't scale to many users
  - No permanent data backup
  - Manual admin (just text file)

**Option B: Professional (Recommended)**
- Pros:
  - Scalable to hundreds of clients
  - Secure backup
  - Professional admin dashboard
  - Better tracking
  - Easier for you to manage
- Cons:
  - Supabase free tier has limits
  - Need to set up database

**My Recommendation: Option B (Supabase)**
- Free tier: 500 MB, up to ~1000 monthly active users
- Perfect for starting up
- Can upgrade later as you grow
- Better for client trust

---

## ===== IMPLEMENTATION TIMELINE =====

```
Day 1: Authentication (3 hours)
  - LoginScreen component
  - AuthContext
  - Email verification mock

Day 2: Credit System (3 hours)
  - CreditService
  - ExecutePanel credit checks
  - Credit deduction logic

Day 3: Admin Dashboard (4 hours)
  - AdminDashboard component
  - Client management
  - Credit management UI

Day 4: Integration & Testing (2 hours)
  - Connect all parts
  - Test login flow
  - Test credit deduction
  - Test persistence

Day 5: Database Setup (1-2 hours, optional)
  - Supabase setup
  - Connect backend services
  - Final testing
```

---

## ===== SUMMARY =====

| Feature | Status | Complexity | Time |
|---------|--------|-----------|------|
| Email Login | New | Easy | 1.5h |
| OTP Verification | New | Easy | 1h |
| Credit Deduction | New | Medium | 1.5h |
| Admin Dashboard | New | Hard | 3h |
| Session Persistence | New | Easy | 1h |
| Database Integration | Optional | Medium | 2h |
| **TOTAL** | | | **9.5h** |

---

## ===== NEXT STEPS =====

1. **Review this plan** - Do you agree?
2. **Choose approach** - Option A (simple) or Option B (Supabase)?
3. **Approve** - Say "Good plan, start implementing" or request changes
4. **I'll implement** - Full implementation with all features

---

## ===== QUESTIONS FOR YOU =====

1. Should we use Supabase (professional) or simple file storage (basic)?
2. What email service for sending verification codes? (Gmail, SendGrid, mock/console for now?)
3. What's your admin password? (I can hardcode it)
4. Do you want transaction history tracking?
5. Should we add credit purchase simulation (fake payment)?
6. Any other features you want in admin dashboard?

