const multer = require('multer');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const config = require('config');
let { getUniversity } = require("../academicServer/services/masterService.js");
const QRCode = require("qrcode");

// Directory for file storage
// let ROOT_FOLDER = 'academic'
// let UPLOAD_TEMP = '../uploads/uploads_temp';
// let UPLOADS = '../uploads';

// === CONFIGURABLE PATHS ===
const UPLOAD_ROOT = config.get('upload');                      // <-- Base upload folder on D: drive
// const sourceDir_new = path.join(__dirname, config.get('upload'));

// const UPLOAD_TEMP = path.join(UPLOAD_ROOT, 'uploads/uploads_temp');
const UPLOAD_TEMP = `${UPLOAD_ROOT}uploads/uploads_temp`;
const UPLOADS = `${UPLOAD_ROOT}uploads`;


const validFolderNamesForImage = ["",];
const validFolderNamesForPdf = ["result_notification",];

// 3 hoursX60 minutes/hourX60 seconds/minute=10,800 seconds
// Create a cache instance with a default TTL of 15 minutes (900 seconds)
const cache_picture_detail = new NodeCache({ stdTTL: 3600 }); //~ 3600 = 1 hours
const cache_pdf_detail = new NodeCache({ stdTTL: 3600 }); //~ 3600 = 1 hours

//~ Function to format current date and time
const formatDateAndTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const date = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0'); // Always 3 digits
    return `d_${year}_${month}_${date}_t_${hours}_${minutes}_${seconds}_${milliseconds}`;
};

// & generate random ID
const generateRandomId = () => {
    return Date.now() + '_' + Math.floor(Math.random() * 1000000);
}

// Ensure directory exists
let ensureUploadTempDir = (subPath = '') => {

    if (!fs.existsSync(UPLOAD_TEMP)) {
        fs.mkdirSync(UPLOAD_TEMP, { recursive: true });
    }

    if (subPath && !fs.existsSync(subPath)) {
        fs.mkdirSync(subPath, { recursive: true });
    }
}

// Ensure directory exists
let ensureUploadDir = (baseFolder = UPLOADS, subFolder) => {  //~ ensureUploadDir(UPLOADS, "gallery");
    const currentDate = new Date();
    const year = (currentDate.getFullYear()).toString();
    const month = (currentDate.getMonth() + 1).toString(); // Month as a number (1-12)

    // Ensure the base folder exists
    if (!fs.existsSync(baseFolder)) {
        fs.mkdirSync(baseFolder, { recursive: true });
    }

    // Create the subfolder path inside the base folder
    const subFolderPath = path.join(baseFolder, subFolder);
    if (!fs.existsSync(subFolderPath)) {
        fs.mkdirSync(subFolderPath, { recursive: true });
    }

    // Create the year folder inside the subfolder
    const yearPath = path.join(subFolderPath, year);
    if (!fs.existsSync(yearPath)) {
        fs.mkdirSync(yearPath, { recursive: true });
    }

    // Create the month folder inside the year folder
    const monthPath = path.join(yearPath, month);
    if (!fs.existsSync(monthPath)) {
        fs.mkdirSync(monthPath, { recursive: true });
    }
    // Return the full path of the dynamically created directory
    return monthPath;
};

//~ Set up storage configuration for multer
let storage = multer.diskStorage({
    destination: function (req, file, cb) {

        // Dynamically get GALLERY_FOLDER from the request
        const folderName = req.params.folderName || req.query.folderName || 'default_folder';
        const uploadPath = path.join(UPLOAD_TEMP, folderName);
        req.params.uploadPath = uploadPath

        //* Ensure the directory exists
        ensureUploadTempDir(uploadPath);
        cb(null, path.join(uploadPath));
    },
    filename: function (req, file, cb) {
        // Specify the filename format
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const extractFileType = (filename) => {
    return path.extname(filename).toLowerCase();
}
//? Function to extract the filename for subtitle
const extractFilenameOnly = (url, fileType) => {
    const start = url.indexOf('-') + 1; // Find the first '-' and start after it
    const end = url.indexOf(fileType); // Find the extension and end before it
    return url.substring(start, end); // Extract the portion of the string
};

//! File filter for validating file type
const imageFilter = (req, file, cb) => {
    const allowedTypes = ['.png', '.jpg', '.jpeg'];
    // const ext = path.extname(file.originalname).toLowerCase();
    const ext = extractFileType(file.originalname)

    if (allowedTypes.includes(ext)) {
        cb(null, true); // Accept file
    } else {
        cb(new Error('Only .png, .jpg, and .jpeg formats are allowed!')); // Reject file
    }
};

const pdfFilter = (req, file, cb) => {
    const allowedTypes = ['.pdf'];
    // const ext = path.extname(file.originalname).toLowerCase();
    const ext = extractFileType(file.originalname)

    if (allowedTypes.includes(ext)) {
        cb(null, true); // Accept file
    } else {
        cb(new Error('Only .pdf formats are allowed!')); // Reject file
    }
};

//& Set up multer with the storage configuration
let imageValidate = multer({
    storage: storage,
    limits: { fileSize: 300 * 1024 }, //~ max file size to 300 kb 
    fileFilter: imageFilter
});

let pdfValidate = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, //~ max file size to 10 MB
    fileFilter: pdfFilter
});

// !--------------------------------------------------------------------------------------------------------------------
//~ Function to recursively get all files in a directory
let getAllFilesRecursively = (dir) => {
    let results = [];
    fs.readdirSync(dir).forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat && stat.isDirectory()) {
            // Recurse into subdirectory
            results = results.concat(getAllFilesRecursively(fullPath));
        } else {
            // Add file to results
            results.push(fullPath);
        }
    });
    return results;
};

//& Function to get all keys and their corresponding values from the cache
let getAllCacheData = () => {
    const keys = cache_picture_detail.keys(); // Get all keys in the cache
    let allData = [];

    keys.forEach((key) => {
        const value = cache_picture_detail.get(key); // Get the cached value by key
        allData.push({ [key]: value });
    });
    return allData;
};

//! Function to delete files not in the cache
let deleteFiles = () => {
    ensureUploadTempDir(UPLOAD_TEMP);
    try {
        // Get all cached files
        const cacheData = getAllCacheData();
        const cachedFiles = new Set(
            cacheData.flatMap(obj => {
                return Object.values(obj).map(value => {
                    if (value) {
                        return value.split('/').pop(); // Extract filename
                    }
                    return null;
                }).filter(Boolean); // Remove null values
            })
        );

        // Get all files recursively in the upload_temp directory
        const allFiles = getAllFilesRecursively(UPLOAD_TEMP);

        allFiles.forEach((file) => {
            const fileName = path.basename(file);

            // Delete file if not in cache
            if (!cachedFiles.has(fileName)) {
                try {
                    fs.unlinkSync(file); // Synchronous delete
                    // console.log(`Deleted file: ${file}`);
                } catch (err) {
                    console.error(`Error deleting file ${file}:`, err);
                }
            } else {
                // console.log(`Skipping cached file: ${fileName}`);
            }
        });
    } catch (err) {
        console.error('Error during file cleanup:', err);
    }
};

//^ Start the cleaning process every 3 hours
let startCleaning = () => {
    // console.log('File cleaning process started...');
    deleteFiles(); // Initial cleanup when app is started

    // Schedule periodic cleanup
    setInterval(() => {
        // console.log('Running periodic delete files task...');
        deleteFiles();
    }, 6 * 60 * 60 * 1000); //~ 6 hours in milliseconds = 6 * 60 * 60 * 1000
    //~ 3 minutes in milliseconds = 3 * 60 * 1000
    //~ 15 minutes in milliseconds = 15 * 60 * 1000
};

//! Self-invoke the cleaning process
startCleaning();

// const moveFile = (file, title = "file", subTitle = "", primaryKey, folderName, extension = ".pdf") => {
//     try {
//         const monthPath = ensureUploadDir(UPLOADS, folderName);

//         const filename = `${title}_${primaryKey}${subTitle ? `_${subTitle}` : ""}_${formatDateAndTime()}${generateRandomId()}${extension}`;
//         const targetPath = path.join(monthPath, filename);

//         // 1️⃣ Node.js Buffer
//         if (Buffer.isBuffer(file)) {
//             fs.writeFileSync(targetPath, file);
//         }

//         // 2️⃣ ArrayBuffer → convert
//         else if (file instanceof ArrayBuffer) {
//             fs.writeFileSync(targetPath, Buffer.from(file));
//         }

//         // 3️⃣ Uint8Array (common in JS)
//         else if (file instanceof Uint8Array) {
//             fs.writeFileSync(targetPath, Buffer.from(file));
//         }

//         // 4️⃣ express-fileupload → { data: Buffer }
//         else if (file?.data && Buffer.isBuffer(file.data)) {
//             fs.writeFileSync(targetPath, file.data);
//         }

//         // 5️⃣ Base64 data URL
//         else if (typeof file === "string" && file.startsWith("data:")) {
//             const base64Data = file.split(";base64,").pop();
//             fs.writeFileSync(targetPath, Buffer.from(base64Data, "base64"));
//         }

//         // 6️⃣ File path
//         else if (typeof file === "string" && fs.existsSync(file)) {
//             fs.copyFileSync(file, targetPath);
//         }

//         else {
//             throw new Error("Unsupported file type provided");
//         }

//         const relativePath = path
//             .relative(UPLOADS, targetPath)
//             .replace(/\\/g, "/");

//         return `/uploads/${relativePath}`;
//     } catch (error) {
//         console.error("❌ Error in moveFile:", error);
//         throw new Error("Failed to save and move file");
//     }
// };

//  helper method for check file type
const validateFileType = (ext, allowedTypes) => {
    return allowedTypes.includes(ext.toLowerCase());
};

const moveFile = (file, title = "file", subTitle = "", primaryKey, folderName, options = {}, callback) => {
    try {
        // Extract extension
        let extension = extractFileType(file?.name || file?.originalname || "");

        // 1️⃣ Validate file extension (if allowed list provided)
        if (options.allowed && !validateFileType(extension, options.allowed)) {
            return callback({
                message: `Invalid file type! Allowed: ${options.allowed.join(", ")}`
            });
        }

        const monthPath = ensureUploadDir(UPLOADS, ROOT_FOLDER, folderName);

        const filename = `${title}_${primaryKey}${subTitle ? `_${subTitle}` : ""}_${formatDateAndTime()}${generateRandomId()}${extension}`;
        const targetPath = path.join(monthPath, filename);

        // 2️⃣ Handle different file formats
        if (Buffer.isBuffer(file)) {
            fs.writeFileSync(targetPath, file);
        }
        else if (file instanceof ArrayBuffer) {
            fs.writeFileSync(targetPath, Buffer.from(file));
        }
        else if (file instanceof Uint8Array) {
            fs.writeFileSync(targetPath, Buffer.from(file));
        }
        else if (file?.data && Buffer.isBuffer(file.data)) {
            // express-fileupload
            fs.writeFileSync(targetPath, file.data);
        }
        else if (typeof file === "string" && file.startsWith("data:")) {
            // Base64 data URL
            const base64Data = file.split(";base64,").pop();
            fs.writeFileSync(targetPath, Buffer.from(base64Data, "base64"));
        }
        else if (typeof file === "string" && fs.existsSync(file)) {
            // Path-based
            fs.copyFileSync(file, targetPath);
        }
        else {
            return callback({ message: "Unsupported file type provided" });
        }

        // 3️⃣ Build relative path
        const relativePath = path
            .relative(UPLOADS, targetPath)
            .replace(/\\/g, "/");

        return callback(null, { relativePath: `/uploads/${relativePath}` });

    } catch (error) {
        console.error("❌ Error in moveFile:", error);
        return callback({
            message: "Failed to save and move file",
            details: error.message
        });
    }
};

const syncMoveFile = (file, title = "file", primaryKey, folderName, sourceDir, fileType) => {
    // sourceDir = sourceDir_new
    try {
        let detail_url;
        if (validFolderNamesForImage.includes(folderName) && fileType === "image") {
            detail_url = cache_picture_detail.take(`${file.id}`); // Get and remove from cache
        } else if (validFolderNamesForPdf.includes(folderName) && fileType === "pdf") {
            detail_url = cache_pdf_detail.take(`${file.id}`);
        } else {
            return null;
        }

        if (detail_url) {
            // Ensure target directory exists
            let monthPath = ensureUploadDir(UPLOADS, folderName); // returns something like: C:/.../uploads/portal/variety/2025/7
            const getFileName = detail_url.split("/").pop(); // extract filename

            const newFilename = `${title}_${primaryKey}_${getFileName}`;
            const sourcePath = path.join(sourceDir, detail_url);
            const targetPath = path.join(monthPath, newFilename);

            // Make sure sourceDir exists
            if (!fs.existsSync(sourceDir)) {
                fs.mkdirSync(sourceDir, { recursive: true });
            }

            // Move (rename) file
            fs.promises.rename(sourcePath, targetPath).catch(err => {
                console.error('Error during moving file:', err);
                throw new Error('Failed to move file');
            });

            // ✅ Normalize the web URL (strip full path)
            const webRoot = path.join(sourceDir, 'uploads').replace(/\\/g, '/'); // e.g., C:/.../uploads
            const cleanedTargetPath = targetPath.replace(/\\/g, '/'); // normalize slashes
            const relativePath = cleanedTargetPath.replace(webRoot, ''); // remove full base path

            return `/uploads${relativePath}`; // ✅ Final clean relative web path
        } else {
            // console.log("Error: file not found in cache");
        }

        return null;
    } catch (error) {
        console.error('Error in syncMoveFile:', error);
        return { error: 'Failed to move file', details: error.message };
    }
};

let getPaginationResponse = (page, size, totalElements, data) => {
    let number = page === 0 ? 0 : page - 1 // ^ for handle zero index
    return {
        number,
        size,
        totalPages: Math.ceil(totalElements / size),
        totalElements,
        data
    }
}

// Helper function to format the date
let formatDate = (date) => {
    try {
        if (!date) return null; // Handle null or undefined dates
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const d = new Date(date);
        if (isNaN(d.getTime())) {
            throw new Error("Invalid date format"); // Catch invalid date inputs
        }
        const day = d.getDate().toString().padStart(2, '0'); // Ensures two-digit day
        const month = months[d.getMonth()];
        const year = d.getFullYear();
        return `${day} ${month} ${year}`;
    } catch (err) {
        console.error("Error formatting date:", err.message);
        return null; // Fallback to null on error
    }
};

let stringToJsonForObject = function (str, errorMessageTitle, callback) {
    if (str && typeof str === "object") {
        return str;
    }
    let fileObject;
    if (str && typeof str === "string") {
        // Trim string to handle any whitespace before parsing
        str = str.trim();

        if (str.startsWith("{") && str.endsWith("}")) {
            try {
                fileObject = JSON.parse(str);

                if (typeof fileObject === 'object' && fileObject !== null && !Array.isArray(fileObject)) {
                    // Successfully parsed a valid object
                    return fileObject;
                } else {
                    // Handle case where parsed JSON is not an object
                    throw new Error(`${errorMessageTitle} is not a valid JSON object.`);
                }
            } catch (error) {
                console.error(`Invalid JSON string for ${errorMessageTitle}: `, error);
                callback(error.message);
                return;
            }
        }
        // else {
        //     // Handle the case where the string is not a valid JSON object
        //     console.error(`Input string is not a valid JSON object for ${errorMessageTitle}.`);
        //     callback(`Input string is not a valid JSON object for ${errorMessageTitle}.`);
        //     return;
        // }
    } else if (!str) {
        return;
    } else {
        // Handle the case where input is not a string
        console.error(`Expected a string for ${errorMessageTitle}, but received: `, str);
        callback(`Expected a string for ${errorMessageTitle}, but received: ${typeof str}`);
        return;
    }
};


let stringToJsonForArray = function (str, errorMessageTitle, callback) {
    if (str && Array.isArray(str)) {
        return str;
    }
    let fileObject;
    if (str && typeof str === "string") {
        // Trim string to handle any whitespace before parsing
        str = str.trim();

        if (str.startsWith("[") && str.endsWith("]")) {
            try {
                fileObject = JSON.parse(str);
                if (Array.isArray(fileObject)) {
                    // Successfully parsed a valid array
                    return fileObject;
                } else {
                    // Handle case where parsed JSON is not an array
                    throw new Error(`${errorMessageTitle} is not a valid JSON array.`);
                }
            } catch (error) {
                console.error(`Invalid JSON string for ${errorMessageTitle}: `, error);
                callback(error.message);
                return;
            }
        }
        //  else {
        //     // Handle the case where the string is not a valid JSON array
        //     console.error(`Input string is not a valid JSON array for ${errorMessageTitle}.`);
        //     callback(`Input string is not a valid JSON array for ${errorMessageTitle}.`);
        //     return;
        // }
    } else if (!str) {
        return;
    } else {
        // Handle the case where input is not a string
        console.error(`Expected a string for ${errorMessageTitle}, but received: `, str);
        callback(`Expected a string for ${errorMessageTitle}, but received: ${typeof str}`);
        return;
    }
};

// Mask mobile number
const maskMobile = (number) => {
    if (!number || number.length < 4) return "0000******";
    return number.substring(0, 4) + "******";
};

// Mask email
const maskEmail = (email) => {
    if (!email || !email.includes('@')) return "****[at]****";

    const [username, domain] = email.split('@');

    // Replace '.' with '[dot]' only in domain
    const maskedDomain = domain.replace(/\./g, '[dot]');

    return `${username}[at]${maskedDomain}`;
};

let getUniversityHeading = function (dbkey, request, params, sessionDetails, callback) {
    return getUniversity(dbkey, request, params, sessionDetails, function (err, res) {
        if (err) return callback(err);
        if (res && res.length > 0) {
            let university = res[0];
            let logoBase64 = fs.readFileSync("assets/images/logo.png", 'base64');
            let logoSrc = `data:image/png;base64,${logoBase64}`;
            let water_mark = config.get('report_water_mark');
            let report_generated_from = config.get('report_generated_from');
            return callback(null, {
                universityHeading: `<div class="title" style="display: flex;
                            justify-content: center;
                            align-items: center;
                            gap: 1rem;">
                                <img src="${logoSrc}" alt="logo" class="university-logo" style="width: 55px !important;
                                height: 55px !important;
                                object-fit: contain;
                                display: inline-block;">     

                                <h1 class="university-title" style="font-family: 'Georgia', serif !important;
                                font-size: 20px !important;
                                font-weight: bold;
                                color: #0dafeaff;
                                text-shadow: 1px 1px 1px 1px #000000;
                                margin-left: 1rem;
                                margin-top: ${params.landscape ? ' -20px;' : ' -30px;'}">${university?.university_name_e}
                                </h1>
                </div>`,
                border: `
                        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; box-sizing: border-box; border: 2px solid #999;
                        width: calc(100% - 20px); height: calc(100% - 20px); margin: 0; z-index: 9999; left: 10px; top: 10px;"></div>
                    `,
                footer: `
                        <div style="font-size:10px; width:100%; padding: 0 25px; color:gray; display:flex; justify-content:space-between;">
                            <div>Report generated from ${report_generated_from}</div>
                            <div>Generated on <span class="date"></span> | Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
                        </div>
                    `,
                water_mark: water_mark,
                university_name_e: university?.university_name_e,
                address_e: university?.address_e,
                address_h: university?.address_h,
                university_shor_name_e: university?.university_shor_name_e,
                university_name_h: university?.university_name_h,
                district_e: university?.district_e,
                district_h: university?.district_h,
                state_e: university?.state_e,
                state_h: university?.state_h
            });
        } else {
            return callback("No University Records found");
        }
    });
}

function parseFilePath(filePath) {
    // Find the index of the last dot (.)
    const lastDotIndex = filePath.lastIndexOf('.');

    // Extract file name without extension and extension
    const fileNameWithoutExt = filePath.substring(0, lastDotIndex);
    const extension = filePath.substring(lastDotIndex); // includes the dot (e.g. ".pdf")

    // Extract just the filename (no path)
    const fileNameWithExt = filePath.split('/').pop();
    const fileName = fileNameWithExt.substring(0, fileNameWithExt.lastIndexOf('.'));

    // Split filename by underscores
    const parts = fileName.split('_');

    // Example pattern: result_notification_1_Regular_d_2025_...
    const title = `${parts[0]}_${parts[1]}`;  // result_notification
    const id = parts[2];                      // 1
    const subtitle = parts[3];                // Regular

    // Return all info
    return {
        path: filePath,
        fileNameWithoutExt,
        extension,
        title,
        id,
        subtitle
    };
}

const generateRandomPassword = () => {
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    //   const symbols = "!@#$%&*";
    //  const symbols = "!@#$%^&*()_+[]{}|;:,.<>?";

    //   const allChars = lower + upper + numbers + symbols;
    const allChars = lower + upper + numbers;

    // Random length between 8 and 12
    // const length = Math.floor(Math.random() * 5) + 8; // (8–12 inclusive)
    const length = 8; // (8–12 inclusive)
    let password = "";

    // Ensure at least one of each character type
    password += lower[Math.floor(Math.random() * lower.length)];
    password += upper[Math.floor(Math.random() * upper.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    //   password += symbols[Math.floor(Math.random() * symbols.length)];

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password so required characters aren’t always at start
    password = password
        .split('')
        .sort(() => Math.random() - 0.5)
        .join('');

    return password;
};

let generateQrCode = (qrInfo, callback) => {
    if (!qrInfo) {
        return callback({ error: "QR Info is required." });
    }

    // QRCode library supports callback style
    QRCode.toDataURL(qrInfo, (err, url) => {
        if (err) {
            return callback({
                error: "QR generation failed",
                details: err.message
            });
        }

        // Extract PNG buffer
        const img = Buffer.from(url.split(",")[1], "base64");

        return callback(null, img);
    });
};


module.exports = {
    formatDateAndTime,
    formatDate,
    generateRandomId,
    imageValidate,
    pdfValidate,
    extractFileType,
    extractFilenameOnly,
    cache_picture_detail,
    cache_pdf_detail,
    moveFile,
    syncMoveFile,
    UPLOAD_TEMP,
    UPLOADS,
    getPaginationResponse,
    validFolderNamesForImage,
    validFolderNamesForPdf,
    stringToJsonForObject,
    stringToJsonForArray,
    maskMobile,
    maskEmail,
    getUniversityHeading,
    parseFilePath,
    generateRandomPassword,
    generateQrCode
}