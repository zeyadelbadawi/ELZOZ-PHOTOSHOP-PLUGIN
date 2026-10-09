# SIMPLE CREDIT SYSTEM PLAN - Email + Password Login

## Overview
Simple, professional credit system where:
- **You (Admin)** create accounts in Supabase with email, password, and credits
- **Clients** login with email + password provided via WhatsApp
- **No code exposure** - Clients get compiled plugin only
- **1 credit per execution** - Deducted on each batch process

---

## WORKFLOW

### Step 1: You Create Client Account (Your Dashboard)
```
You → Supabase Console OR Simple Admin Dashboard
- Email: client@example.com
- Password: (auto-generated or you set it)
- Credits: 2000
- Status: active
→ Save to database
```

### Step 2: Share Credentials with Client
```
You (via WhatsApp):
"Hi! Your Elzoz Studio credentials:
Email: client@example.com
Password: Pass123456
Credits: 2000

Download plugin: [link to compiled plugin]
Extract and follow instructions to install.
Enjoy!"
```

### Step 3: Client Installs Plugin
```
Client receives compiled .ccx file (no source code visible)
- Extract to Photoshop plugins folder
- Restart Photoshop
- Plugin shows login screen
```

### Step 4: Client Logs In
```
Client opens plugin
→ Login screen appears
→ Enters: email + password
→ System validates against Supabase
→ Shows: "Welcome! You have 2000 credits"
→ Can start using immediately
```

### Step 5: Credits Get Deducted
```
Client uses batch process (16 designs)
- Each execution = 1 credit
- 16 designs = 16 credits deducted
- Shows: "Credits remaining: 1984"
- Data saved to Supabase instantly
```

### Step 6: Plugin Closes & Reopens (Session Persistence)
```
Client closes Photoshop/Plugin
→ Credits saved in Supabase (server-side)
→ Client reopens plugin days later
→ Login again with same credentials
→ See correct balance: "1984 credits"
→ Can continue working
```

### Step 7: Credits Run Out
```
Client has 0 credits
→ Tries to execute
→ Error: "Insufficient credits (need 16, have 0)"
→ Button disabled/blocked
→ Can't proceed
→ Contacts you: "I need more credits"
→ You add credits in Supabase
```

---

## DATABASE SCHEMA (Supabase)

### Table: users
```sql
id (uuid, primary key)
email (text, unique)
password_hash (text) - bcrypt hashed
credits (integer) - default: 0
created_at (timestamp)
updated_at (timestamp)
status (text) - 'active', 'suspended'
```

### Table: credit_transactions
```sql
id (uuid, primary key)
user_id (uuid, foreign key)
amount (integer) - positive for add, negative for deduct
reason (text) - 'batch_execution', 'manual_add', 'refund'
balance_before (integer)
balance_after (integer)
created_at (timestamp)
```

---

## COMPONENTS TO CREATE

### 1. Login Component (`LoginPanel.jsx`)
```
Shows when user NOT logged in:
- Email input
- Password input
- Login button
- Error messages
- Loading state

Validates:
- Email format
- Password not empty
- Checks Supabase auth
- Stores session locally
```

### 2. Account Status Component (`AccountStatus.jsx`)
```
Shows when logged in:
- Email: client@example.com
- Credits: 2000 ✓
- Status: Active
- Last updated: just now
- Logout button
```

### 3. Admin Dashboard (Optional, Simple Version)
```
Access: You only (password protected)
Shows:
- List of all clients
- Email, Credits, Status
- Buttons: Add Credits, Suspend, Delete
- Add New Client form
```

---

## SECURITY APPROACH

### Client Side (Plugin)
```
✓ Password never stored in plugin code
✓ Credentials sent only to Supabase
✓ Session stored locally (encrypted)
✓ Can't access other clients' data
✓ No hardcoded API keys visible
```

### Server Side (Supabase)
```
✓ Row Level Security (RLS) enabled
  - Users can only see their own data
  - Can't modify others' credits
✓ Passwords hashed with bcrypt
✓ Credit deductions logged in transactions table
✓ Admin-only access to dashboard
```

### Plugin Distribution
```
✓ Compile plugin to .ccx file (binary, not readable)
✓ No source code exposed to clients
✓ Version control on your end
✓ Easy updates - just send new .ccx file
```

---

## LOGIN FLOW (Technical)

### User Enters Credentials
```
1. Client enters: email@example.com + password123
2. Click "Login"
3. Show: "Verifying..."
```

### Plugin Validates
```
1. Supabase.auth.signInWithPassword({
     email: "email@example.com",
     password: "password123"
   })
2. Supabase returns: { user, session, error }
3. If error → Show: "Invalid email or password"
4. If success → Continue
```

### Fetch User Credits
```
1. Get logged-in user ID
2. Query: SELECT credits FROM users WHERE id = user_id
3. Store in ProjectContext
4. Show: "Welcome! 2000 credits available"
```

### Session Storage
```
1. Save session token locally
2. On plugin restart:
   - Check for saved session
   - If valid → Skip login, show home
   - If expired → Show login screen
```

---

## CREDIT DEDUCTION LOGIC

### When User Clicks "Execute"
```
1. Check credits: if (credits < itemCount) return error
2. Show: "Processing 16 items... (need 16 credits)"
3. Process batch
4. Deduct: credits -= 16
5. Save to Supabase: UPDATE users SET credits = credits - 16
6. Log transaction: INSERT INTO credit_transactions
7. Show: "✓ Success! 1984 credits remaining"
```

### Persistent & Instant
```
✓ Deduction happens on Supabase immediately
✓ Not stored locally first
✓ Can't cheat by closing plugin mid-process
✓ Next plugin open shows correct balance
```

---

## PLUGIN DISTRIBUTION (NO CODE EXPOSURE)

### What Clients Get
```
1. Compiled plugin file: Elzoz-Studio-v1.0.ccx
   - Binary format (not readable)
   - 500-800 KB size
   - Ready to install
   
2. Installation instructions (PDF):
   - Windows: Paste to ...\Adobe\Photoshop\Plugins
   - Mac: Paste to ~/Library/Application Support/Adobe/Photoshop/Plugins
   - Restart Photoshop
   - Look for "Elzoz Studio" in Window menu
   
3. WhatsApp credentials:
   - Email: their_email@example.com
   - Password: their_password
   - Support: your_number
```

### You Keep
```
✓ Source code in Git (private repo)
✓ Production build script
✓ Ability to push updates
✓ Can add/modify features anytime
```

### Updates
```
When you make improvements:
1. Update code
2. Run: npm run build:plugin
3. Get new .ccx file
4. Send to clients: "New version available"
5. They replace old file with new
6. Restart Photoshop
→ Everyone gets latest version
```

---

## FILES TO CREATE/MODIFY

### New Files
```
src/components/LoginPanel.jsx - Login UI
src/components/AccountStatus.jsx - Shows credits + logout
src/services/AuthService.js - Supabase auth logic
src/services/SessionService.js - Session persistence
admin/AdminDashboard.jsx - (Optional) simple admin
```

### Modified Files
```
src/context/AccountContext.jsx - Add login/logout logic
src/components/AppContainer.jsx - Show login if not authenticated
src/panels/ExecutePanel.jsx - Check credits before execution
package.json - Add @supabase/supabase-js
```

### Configuration
```
.env.local - SUPABASE_URL, SUPABASE_KEY
```

---

## STEP-BY-STEP IMPLEMENTATION

### Phase 1: Setup (1 hour)
- Create Supabase project
- Create users table + credit_transactions table
- Enable Row Level Security
- Create API keys

### Phase 2: Auth Service (2 hours)
- Build AuthService with login/logout
- Build SessionService for persistence
- Error handling & validation

### Phase 3: UI Components (2 hours)
- LoginPanel component
- AccountStatus component
- Integration with AppContainer

### Phase 4: Credit System (2 hours)
- Modify ExecutePanel to check credits
- Add credit deduction on execution
- Update UI to show balance
- Log transactions

### Phase 5: Testing & Polish (1.5 hours)
- Test login/logout
- Test credit deduction
- Test session persistence
- Test error cases

**Total: ~8.5 hours of development**

---

## ADMIN WORKFLOW (Simple Version)

### Option A: Manual Supabase Console
```
1. Go to supabase.com
2. Open your project
3. Go to "auth" → "users"
4. Click "Add user"
5. Email: client@example.com
6. Password: Auto-generate
7. Save
8. Go to "users" table
9. Add row with credits: 2000
10. Share credentials via WhatsApp
```

### Option B: Simple Admin Dashboard (If you want)
```
In plugin (password protected):
1. New tab: "Admin"
2. Shows all clients
3. Buttons:
   - Add Client (email + password + credits)
   - Add Credits (pick client, enter amount)
   - Suspend Client
   - View Transactions
4. Built in 2-3 hours extra
```

---

## PRICING EXAMPLE

### You Offer
```
- Basic Plan: 500 credits = $25
- Pro Plan: 2000 credits = $75
- Premium Plan: 5000 credits = $150
```

### Client Gets
```
1. Creates WhatsApp with you
2. Says: "I want 2000 credits"
3. Pays $75 (via bank transfer, Paypal, etc)
4. You create account in Supabase
5. Send: Email + Password + Login Instructions
6. Client uses immediately
7. When credits run out → contacts you again
```

---

## KEY DIFFERENCES FROM PREVIOUS PLAN

| Feature | Previous Plan | New Plan |
|---------|---------------|----------|
| Login Method | OTP via Email | Email + Password |
| Account Creation | Self-signup | You create manually |
| Email Service | SendGrid needed | Not needed |
| Client Setup | Complex | Super simple |
| Distribution | Plugin + download link | Just .ccx file |
| Code Exposure | Possible | Zero exposure |
| Time to Implement | 12+ hours | 8-9 hours |
| Scalability | Medium | High |

---

## PROS & CONS

### PROS
```
✓ Super simple for clients
✓ No email delivery issues
✓ No OTP confusion
✓ Faster implementation
✓ You control everything
✓ Zero code exposure
✓ Easy updates
✓ Professional feel
```

### CONS
```
✗ Manual account creation (but quick)
✗ You handle password resets
✗ No self-service signup
  (but not needed - selling directly)
```

---

## NEXT STEPS

### If You Approve This Plan:
1. ✓ I set up Supabase project
2. ✓ Create users table + transactions table
3. ✓ Build LoginPanel component
4. ✓ Build AccountStatus component
5. ✓ Integrate into AppContainer
6. ✓ Modify ExecutePanel for credit checking
7. ✓ Test everything
8. ✓ Build compiled .ccx plugin file
9. ✓ Create installation guide

### What You Need to Provide:
- Supabase account (free tier is fine)
- WhatsApp number for client support
- Plugin version number (e.g., 1.0)

---

## QUESTIONS FOR YOU

Before I start coding, please confirm:

1. **Supabase Project**: Do you already have one, or should I explain how to create it?
2. **Admin Dashboard**: Do you want the simple admin panel in the plugin, or manual Supabase console only?
3. **Password Reset**: How should clients reset passwords? (Email link? WhatsApp?)
4. **Support Contact**: Should login screen show your support number/email?
5. **Pricing Tiers**: What credit amounts will you offer?

---

**This plan is:**
- ✓ Production-ready
- ✓ Professional
- ✓ Simple to implement
- ✓ Easy for clients
- ✓ Zero code exposure
- ✓ Scalable to many clients
