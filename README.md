# CapstoneBackEnd

Backend README: The Grown Folks Collective API
Project Overview
This is the custom-built server for my capstone project, The Grown Folks Collective. It’s a MERN stack application designed to handle professional intake and event sign-ups. I built this using Node.js and Express to manage all the "behind the scenes" work like data validation, member storage, and connecting to MongoDB.

Tech:
Node.js & Express: Used for all the server-side logic and RESTful routing.
MongoDB & Mongoose: My database choice for storing flexible member data and dinner sign-ups.
Bcrypt: I implemented this for secure password hashing during the login process.
Dotenv: Secure environment variable management for API keys and database URI.

Data Structure (The Schemas):
I designed these schemas to keep the data clean and searchable:

1. Membership Intake (applicants)
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


API Capabilities (CRUD)The API supports full Create, Read, Update, and Delete operations:
Method             Endpoint                  Description
GET               /api/applicants.         Fetches all members with dynamic search/filter support.
POST              /api/applicants          Submits a new membership intake form.
PUT               /api/applicants/:id      Updates status (e.g., Pending → Accepted).
DELETE            /api/applicants/:id      Removes a record from the database.
POST              /api/admin/login         Securely authenticates admins via Bcrypt comparison.

Setup & Installation

Clone the repo: git clone 

Install dependencies: npm install

Configure .env: Add your MONGO_URI and ADMIN_KEY.

Seed the database: Run GET /api/seed-all to populate initial GFC data.

Start the server: npm run dev

## 🖥️ Frontend Repository
The user interface for the Grown Folks Collective is built with **React** and **Vite**. You can find the frontend code, including the Admin Dashboard and Membership Intake forms, at the link below:

👉 **[GFC Frontend Repository] https://github.com/NovAldesign/CapstoneFrontEnd.git