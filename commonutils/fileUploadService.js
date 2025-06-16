let path = require("path");
const config = require('config');
let upload_directory = config.get('upload_path')

module.exports.docUpload = function (dbkey, request, params, sessionDetails, callback) {
    if (!(request.files && params.file_name)) {
        return callback({ message: `No files Found to upload.` });
    }
    let file_name = params["file_name"];
    let file_path = ``;
    const allowedExtension = ['.pdf'];
        const file = request.files.file;
        const extensionName = path.extname(file.name);

        if (!allowedExtension.includes(extensionName)) {
            return cback1({ "message": "Not a PDF File", "code": "INVALID_FILE" });
        }

        file_name = `${file_name}.pdf`;
        file_path = path.join(upload_directory , file_name);
        file.mv(file_path, function (err1, res1) {
            if (err1) {
                return callback(err1);
            }
            else {
                return callback(null, { file_path: file_path });
            }
        })
}