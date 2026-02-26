# CapstoneBackEnd

Backend README: The Grown Folks Collective API
Project Overview
This is the custom-built server for my capstone project, The Grown Folks Collective. It’s a MERN stack application designed to handle professional intake and event sign-ups. I built this using Node.js and Express to manage all the "behind the scenes" work like data validation, member storage, and connecting to MongoDB.

Tech:
Node.js & Express: Used for all the server-side logic and RESTful routing.
MongoDB & Mongoose: My database choice for storing flexible member data and dinner sign-ups.
Bcrypt: I implemented this for secure password hashing during the login process.

Data Structure (The Schemas):
I designed these schemas to keep the data clean and searchable:

Membership Intake:
  {
        category:
        {
            type: String,
            default: "applicants",
        },
        name:
        {
            type: String,
            required: true,
    
        },
        email:
        {
            type: String,
            unique: true,
            required: true,
            index: true,
        },

        phone:
        {
            type: String,
            unique: true,
            required: true,
        },

        dob:
        {
            type: Date,
            required: true,
        },
        industry:
        {
            type: String,
            required: true,
            index: true,

        },
        tier:
            { 
                type: String,
                enum: ["Platinum", "Gold", "Silver"],
                default: "Silver",
            },

        status:
            { 
                type: String,
                enum: ["accepted", "pending"],
                default: "pending"
            },

        isFirstTimeFounder:
            { 
                type: Boolean, 
                default: false,    
            },

        submittedAt: 
        { 
            type: Date, 
            default: Date.now 
        }

    });


Intentional Dinner Conversations:
memberID: Links the dinner sign-up to a specific user in the database.
dinnerDate: Date, Required.
topic: String, Required (The specific topic for that night’s conversation).

API Capability (CRUD): 
POST: This is how my signup forms and dinner forms send data to the database.
GET: I use this to pull all the applicants into the Admin Dashboard so they can be reviewed.
PUT: This allows me to actually change a member's status from 'Pending' to 'Approved.'
DELETE: A way for the admin to remove old or incorrect records.

We will use SBA 319 for the Schema and intake form.
