const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    // Force PDFs and common docs to be 'raw' to avoid 401 Image errors
    const isRaw = !file.mimetype.startsWith('image/');
    
    // Clean the filename: remove extension from public_id to avoid double extensions
    const cleanName = file.originalname.split('.').slice(0, -1).join('.') || file.originalname;
    const publicId = `${Date.now()}-${cleanName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')}`;

    return {
      folder: `college-portal/notes/${req.body.branch || 'general'}`,
      resource_type: isRaw ? 'raw' : 'image',
      public_id: publicId,
    };
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File format not supported. Supported: PDF, DOC, PPT, Excel, ZIP, CSV, Images.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
});

module.exports = { cloudinary, upload };
