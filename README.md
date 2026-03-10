# CapstoneBackEnd

Backend README: The Grown Folks Collective API
Project Overview
This is the custom-built server for The Grown Folks Collective, a social ecosystem designed to end social isolation for adults 35+ through curated dinners, game nights, and travel.

Built on the MERN stack, this API manages a unified portal for Admins, Members, and Partners. It handles complex authentication, secure document storage, and connection-based data metrics.

Tech Stack:
Node.js & Express: Used for all the server-side logic and RESTful routing.
MongoDB & Mongoose: My database choice for storing flexible member data and dinner sign-ups.
Bcrypt: I implemented this for secure password hashing during the login process.
Dotenv: Secure environment variable management for API keys and database URI.
Multer: Integrated for secure partner document and logo uploads.
Express-Rate-Limit: Implemented to prevent brute-force attacks on the login portal.

Data Structure (The Schemas):
I designed these schemas to keep the data clean and searchable:

1. Membership Intake (memberships)
   Captures detailed founder data for the GFC community.

Searchable Fields: Name, Email, Industry (Indexed for performance).

Validation: Strict Enums for Membership Tiers (Platinum, Gold, Silver).

Logic: Tracks isFirstTimeFounder and submittedAt timestamps.

2. Partnership Tracking (sponsors)
   Manages business relationships and travel strategy partners.

Contract Logic: Includes automated calculations for renewal dates.

Alignment Check: Strings for verifying "Mission Alignment" before approval.

3. Admin & Security (admins)
   Handles the secure dashboard access.

Encryption: Automatic Bcrypt pre-save hooks for password hashing.

Audit Trail: Tracks lastAction and lastLoginIp for security monitoring.

Data Architecture (The Schemas)
I designed these schemas to prioritize security and community connection:

1. Membership Profile (memberships)
Beyond standard data, this tracks social alignment to facilitate authentic connections.

Connection Metrics: Tracks socialSatisfaction and primaryInterest (e.g., Spades, Golf, Travel).

Luxe Logistics: Stores favoriteMocktail and apparelSize for event planning.

Security: Includes securityQuestion and securityAnswer (hidden from queries).

2. Partnership Vault (partnerships)
Manages corporate relationships and sponsors.

Document Array: Stores contract and logo metadata linked to local storage.

Renewal Logic: Calculates contract status automatically.

3. Unified Security (admins)
Handles high-level oversight and system resets.

Audit Trail: Tracks lastAction for security monitoring.

API Capabilities (CRUD)The API supports full Create, Read, Update, and Delete operations:
Method Endpoint Description
GET /api/memberships. Fetches all members with dynamic search/filter support.
POST /api/memberships Submits a new membership intake form.
PUT /api/memberships/:id Updates status (e.g., Pending → Accepted).
DELETE /api/memberships/:id Removes a record from the database.
POST /api/admin/login Securely authenticates admins via Bcrypt comparison.

Setup & Installation

1. Clone the repo: git clone

2. Install dependencies: npm install

3. Configure .env: ```env
   MONGO_URI=your_mongodb_string
   ADMIN_KEY=your_secret_access_key
   PORT=3001

4. Initialize Folders: Ensure an /uploads folder exists in the root directory.

5. Seed the database: Run GET /api/admin/seed-all to populate initial GFC data.

6. Start the server: npm run dev

## 🖥️ Frontend Repository

The user interface for the Grown Folks Collective is built with **React** and **Vite**. You can find the frontend code, including the Admin, Partnership, Membership Dashboard and Membership, Admin, and Partnership Intake forms, at the link below:

👉 [GFC Frontend Repository] https://github.com/NovAldesign/CapstoneFrontEnd.git
