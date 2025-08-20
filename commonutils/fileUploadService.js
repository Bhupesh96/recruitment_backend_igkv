let path = require("path");
const config = require("config");
let upload_directory = config.get("upload_path");
const fs = require("fs");

module.exports.docUpload = function (
  dbkey,
  request,
  params,
  sessionDetails,
  callback
) {
  if (!(request.files && params.file_name)) {
    return callback({ message: `No files Found to upload.` });
  }

  const { control_name = "file" } = params;
  let file_name = params["file_name"];
  let file_path = ``;

  // ✅ Allow both PDFs and common image formats
  const allowedExtension = [".pdf", ".jpg", ".jpeg", ".png"];
  const file = request.files[control_name];
  const extensionName = path.extname(file.name).toLowerCase();

  if (!allowedExtension.includes(extensionName)) {
    return callback({
      message: "Invalid file type. Only PDF/JPG/PNG allowed",
      code: "INVALID_FILE",
    });
  }

  // ✅ Ensure file is saved with the correct extension
  file_name = `${file_name}${extensionName}`;
  file_path = path.join(upload_directory, file_name);

  file.mv(file_path, function (err1) {
    if (err1) {
      return callback(err1);
    } else {
      return callback(null, { file_path: file_path });
    }
  });
};

module.exports.docUploadWithFolder = function (
  dbkey,
  request,
  params,
  sessionDetails,
  callback
) {
  if (!(request.files && params.file_name && params.folder_name)) {
    return callback({ message: `No files Found to upload.` });
  }

  const { control_name = "file", folder_name } = params;
  let file_name = params["file_name"];

  // ✅ Allow PDF and common image types
  const allowedExtension = [".pdf", ".jpg", ".jpeg", ".png"];
  const file = request.files[control_name];
  const extensionName = path.extname(file.name).toLowerCase();

  console.log("🔍 config upload_path:", upload_directory);
  console.log("📁 folder_name param:", folder_name);

  if (!allowedExtension.includes(extensionName)) {
    return callback({
      message: "Invalid file type. Only PDF/JPG/JPEG/PNG allowed.",
      code: "INVALID_FILE",
    });
  }

  const targetFolder = path.join(upload_directory, folder_name);
  console.log("📂 Full target folder:", targetFolder);

  ensureFolderExists(targetFolder, () => {
    let new_upload_directory = targetFolder;

    // ✅ Use correct file extension
    file_name = `${file_name}${extensionName}`;
    const file_path = path.join(new_upload_directory, file_name);

    console.log("📄 Final file path:", file_path);

    file.mv(file_path, function (err1) {
      if (err1) {
        console.error("❌ Error moving file:", err1);
        return callback(err1);
      } else {
        console.log("✅ File successfully saved to:", file_path);
        return callback(null, { file_path: file_path });
      }
    });
  });
};

function ensureFolderExists(folderPath, cb) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  cb();
}
