Backend README (CapstoneBackEnd)
The Grown Folks Collective | Executive API
A robust Node.js/Express API powering the infrastructure of social connection.

System Architecture
Built on a RESTful MERN architecture, this API features a tiered security model and automated filesystem management (coming soon) to handle the complex needs of a growing social ecosystem.

🛠️ Core Runtime & Framework
Node.js: The asynchronous event-driven JavaScript runtime used to build the scalable network application.

Express.js: The minimalist web framework used to design the RESTful API endpoints and handle middleware logic.

🗄️ Database & Modeling
MongoDB Atlas: A cloud-based NoSQL database used for flexible, document-oriented data storage (Members, Admins, and Partnerships).

Mongoose (ODM): Used to provide a schema-based solution to model your application data, including built-in validation and relationship management.

🔐 Security & Authentication
JSON Web Tokens (JWT): Facilitates secure, stateless authentication for the Admin Dashboard.

Bcrypt: Handles irreversible password hashing (Salt Factor: 12) to protect administrative credentials.

CORS: Configured for secure cross-origin resource sharing between your Vite frontend and Express backend.

Express-Rate-Limit: Protects the API from brute-force attacks by limiting repeated requests to public routes.

📁 File Handling & Filesystem
Multer: Specialized middleware for handling multipart/form-data, specifically used for the "Partnership Vault" to upload and store organization logos.

Node File System (fs) & Path: Utilized for "Folder Safety Checks" to automatically detect or create the /uploads directory upon server initialization.

⚙️ Development Utilities
Dotenv: Manages environment variables (e.g., MONGO_URI, JWT_SECRET) to keep sensitive credentials out of the source code.

Nodemon: Used in development to automatically restart the server upon file changes, increasing productivity.


API ROUTES
These are the primary views available in the Grown Folks Collective portal:

Home (/): The landing experience featuring the mission statement, social wellness philosophy, and call-to-action for new members.

Events (/events): The real-time dashboard powered by the Eventbrite API, displaying upcoming alcohol-free social gatherings and past community highlights.

Partnership (/partnerships): The dedicated intake portal for organizations. This route handles the Multer-powered file uploads for brand assets and logos.

Membership (/membership): The application gateway where prospective members submit their "Connection Metrics" (interests like Spades, Golf, and Travel).

Login (/login): The secure gateway for Admins and Members. This route initiates the JWT authentication flow and manages session persistence.

Admin Dashboard (/admin): 🔒 Protected Route. Only accessible to users with a valid "Admin" role via the protect and restrictTo middleware.


Setup & Installation

Getting Started
Clone the repo: git clone https://github.com/NovAldesign/CapstoneBackEnd.git

Configure .env:

Code snippet
PORT=3001
MONGO_URI=your_mongodb_uri
JWT_SECRET=gfc_super_secret_key_2024
Start Server: npm run dev (Automated directory creation included).

## 🖥️ Frontend Repository

The user interface for the Grown Folks Collective is built with **React** and **Vite**. You can find the frontend code, including the Admin, Partnership, Membership Dashboard and Membership, Admin, and Partnership Intake forms, at the link below:

👉 [GFC Frontend Repository] https://github.com/NovAldesign/CapstoneFrontEnd.git

ClickUp Project Management https://sharing.clickup.com/9014876050/l/h/6-901413868218-1/f0876eea91c3c06
I used this app to help keep the flow of all the tasks needed to complete my Capstone.