import multer from 'multer';
import path from 'path';

// 1. Set where to store the files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Make sure to create an 'uploads' folder in your backend root
  },
  filename: (req, file, cb) => {
    // Rename file to avoid duplicates: partnerID-timestamp.extension
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// 2. Filter for specific file types (PDFs and Images)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  
  if (extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only images and PDFs are allowed!'));
  }
};

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter 
});

export default upload;