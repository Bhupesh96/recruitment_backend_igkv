const fs = require("fs");
const path = require("path");
const SHARED_SERVICE = global.SHARED_SERVICE;
const { appStruture, securityServiceStruture, commonRouteStruture, wwwFileStruture, functionStruture, serviceStruture, routeStruture, serviceFileAddStructure, securitySercviceImportStructure } = require("../../serverCreationStructure.js");
var async = require("async");

const serverCreation = {
  addServer: function (dbkey, request, params, sessionDetails, callback) {
    const { name, prefix, port } = params;
    const ServerFolderPath = path.join(__dirname, "..", "..", name);
    const binFolderPath = path.join(ServerFolderPath, "bin");
    const wwwFilePath = path.join(binFolderPath, "www");
    const appFilePath = path.join(ServerFolderPath, "app.js");
    const routeFolderPath = path.join(ServerFolderPath, "routes");
    const commonrouteFilePath = path.join(routeFolderPath, "commonroutes.js");
    const serviceFolderPath = path.join(ServerFolderPath, "services");
    const securityServiceFilePath = path.join(serviceFolderPath, "securityservice.js");

    async.series(
      [
        // Create base folders
        function (cb) {
          ensureFolderExists(ServerFolderPath, cb);
        },
        function (cb) {
          ensureFolderExists(binFolderPath, cb);
        },
        function (cb) {
          ensureFolderExists(routeFolderPath, cb);
        },
        function (cb) {
          ensureFolderExists(serviceFolderPath, cb);
        },
        // Create files
        function (cb) {
          writeFile(wwwFilePath, wwwFileStruture(port), cb);
        },
        function (cb) {
          writeFile(appFilePath, appStruture(prefix), cb);
        },
        function (cb) {
          writeFile(commonrouteFilePath, commonRouteStruture(), cb);
        },
        function (cb) {
          writeFile(securityServiceFilePath, securityServiceStruture(), cb);
        },
      ],
      function (err) {
        if (err) {
          if (fs.existsSync(ServerFolderPath)) {
            fs.rmSync(ServerFolderPath, { recursive: true, force: true });
            console.log("Folder and its contents deleted due to error");
          }
          return callback(err);
        }
        return callback(null, { message: "server created successfully" });
      }
    );
  },


  addBackendService: function (dbkey, request, params, sessionDetails, callback) {
    const { server_name, service_name,pid } = params;
    const serviceFilePath = path.join(__dirname, "..", "..", server_name, "services", `${service_name}.js`);
    const routeFilePath = path.join(__dirname, "..", "..", server_name, "routes", `commonroutes.js`);
    const securityServiceFilePath = path.join(__dirname, "..", "..", server_name, "services", `securityservice.js`);
    const backupRoutePath = routeFilePath + '.bak';
    const backupSecurityServicePath = securityServiceFilePath + '.bak';
    let routeName = service_name.replace('Service', '');
    try {
      if (fs.existsSync(serviceFilePath)) {
        return callback({ message: "Service already exists" });
      }
      if (!fs.existsSync(routeFilePath)) {
        return callback({ message: `commonroute not exists on path ${routeFilePath} ` });
      }
      if (!fs.existsSync(securityServiceFilePath)) {
        return callback({ message: `securityService  not  exists on path ${securityServiceFilePath}` });
      }

      async.series([
        // add service file
        function (cback1) {
          writeFile(serviceFilePath, serviceStruture(params.service_name), cback1);
        },
        // create route in common route file
        function (cback2) {
          fs.copyFileSync(routeFilePath, backupRoutePath);
          let fileContent = fs.readFileSync(routeFilePath, "utf8");
          const exportIndex = fileContent.indexOf(`module.exports.init = init`);
          if (exportIndex === -1) {
            return cback2({ message: `module.exports.init = init not found.` });
          }
          const beforeExport = fileContent.slice(0, exportIndex);
          const lastBraceIndex = beforeExport.lastIndexOf('}');
          if (lastBraceIndex === -1) {
            return cback2({ message: 'Closing brace not found' });
          }
          const updatedContent = fileContent.slice(0, lastBraceIndex) + routeStruture(routeName) + fileContent.slice(lastBraceIndex);
          fs.writeFileSync(routeFilePath, updatedContent);
          cback2();
        },
        // update security service file
        function (cback3) {
          fs.copyFileSync(securityServiceFilePath, backupSecurityServicePath);
          let fileContent = fs.readFileSync(securityServiceFilePath, "utf8");
          const securityMarker = 'var security = {';
          if (!fileContent.includes(securitySercviceImportStructure(params.service_name))) {
            fileContent = fileContent.replace(securityMarker, securitySercviceImportStructure(params.service_name) + '\n' + securityMarker);
          }
          fileContent = fileContent.replace(
            /(let\s+service_files\s*=\s*{)([\s\S]*?)(\n})/,
            (match, p1, p2, p3) => {
              if (p2.includes(`"${params.service_name}"`)) return match;
              return `${p1}${p2}\n${serviceFileAddStructure(params.service_name,routeName)}${p3}`;
            }
          );
          fs.writeFileSync(securityServiceFilePath, fileContent);
          cback3();
        },
        // insert service in db
        function (cb) {
          let insert_obj = {
            table_name: 'backend_services_files',
            pid: pid,
            service_name: params.service_name,
            created_user_id: sessionDetails['user_id'],
            created_ip_address: sessionDetails['ip_address']
          };
          SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
            if (err) return cb(err);
            if (res.data && res.data['insertId']) {
              params.service_file_id = res.data['insertId']
              return cb()
            }
            return cb({ message: `something went wrong on insert in table backend_services_files.` });
          });
        }

      ], function (err, res) {
        if (err) {
          if (fs.existsSync(serviceFilePath)) {
            fs.unlinkSync(serviceFilePath);
            console.log('Service file deleted due to error.');
          }
          if (fs.existsSync(backupRoutePath)) {
            fs.copyFileSync(backupRoutePath, routeFilePath);
            fs.unlinkSync(backupRoutePath);
            console.log('Route file restored from backup.');
          }
          if (fs.existsSync(backupSecurityServicePath)) {
            fs.copyFileSync(backupSecurityServicePath, securityServiceFilePath);
            fs.unlinkSync(backupSecurityServicePath);
            console.log('Security service file restored from backup.');
          }
          return callback(err);
        } else {
          fs.unlinkSync(backupRoutePath);
          fs.unlinkSync(backupSecurityServicePath);
          return callback(null, { service_file_id: params.service_file_id, service_name, pid });
        }
      });

    } catch (err) {
      console.error("Exception caught in addBackendService:", err);

      // Rollback on exception
      if (fs.existsSync(serviceFilePath)) {
        fs.unlinkSync(serviceFilePath);
      }
      if (fs.existsSync(backupRoutePath)) {
        fs.copyFileSync(backupRoutePath, routeFilePath);
        fs.unlinkSync(backupRoutePath);
      }
      if (fs.existsSync(backupSecurityServicePath)) {
        fs.copyFileSync(backupSecurityServicePath, securityServiceFilePath);
        fs.unlinkSync(backupSecurityServicePath);
      }

      return callback({ message: 'Unexpected error occurred', error: err.message });
    }
  },


  addFunction: function (dbkey, request, params, sessionDetails, callback) {
    const { server_name, service_name, api_name } = params;
    if (!(server_name && service_name && api_name)) {
      return callback({ message: "server_name and service_name are required for function creation." });
    }
    const filePath = path.join(__dirname, "..", "..", server_name, "services", `${service_name}.js`);
    if (!fs.existsSync(filePath)) {
      return callback({ message: `Service file not found at ${filePath}` });
    }
    let fileContent = fs.readFileSync(filePath, "utf8");

    // Find the position of 'module.exports'
    if(!service_name.endsWith('Service')){return callback({ message: `service_name ${service_name} must end with 'Service'.` });}
    let updated = service_name.replace('Service', '');
    const exportIndex = fileContent.indexOf(`module.exports = ${updated}`);

    if (exportIndex === -1) {
      return callback({ message: `module.exports = ${service_name} not found.` });
    }

    // Search backward from that point to find the last closing brace of the demo object
    const beforeExport = fileContent.slice(0, exportIndex);
    const lastBraceIndex = beforeExport.lastIndexOf('}');

    if (lastBraceIndex === -1) {
      return callback({ message: 'Closing brace not found' });
    }

    // Inject the method just before the closing brace
    const updatedContent = fileContent.slice(0, lastBraceIndex) + functionStruture(api_name) + fileContent.slice(lastBraceIndex);

    // Write back the modified file
    fs.writeFileSync(filePath, updatedContent);
    return callback(null, { message: "function added successfully" });
  },
};
module.exports = serverCreation;

function ensureFolderExists(folderPath, cb) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  cb();
}

function writeFile(filePath, data, cb) {
  fs.writeFile(filePath, data, (err) => cb(err));
}
