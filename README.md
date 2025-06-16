# IGKV Backend Server

### Add/Alter Database Connection

1. In your configuration file (e.g., config/development.json or config/production.json), add a connection object using a
   meaningful key name:

```
 "key_name":{
        "host": "ip_address",
        "user": "user_name",
        "password": "password",
        "database": "database_name"
    },
```

2. Register the Connection Object in commonutils/commonconfs.js

```
getTestDB: () => {
   return JSON.parse(JSON.stringify(config.get('key_name')));
}
```

#### Note: -

* Frontend validation should follow the table schema structure defined in the database.
* Inside the confs object, define a function using the database name for clarity:
* Ensure the function name (getTestDB) and the key (key_name) match logically to avoid confusion.

3. Insert a record for the new database into the mas_databases table.
4. Map the database function and ID in the map_dbkey_database object in commonutils/commonconfs.js:

```
confs.map_dbkey_database  {
   "db_id": confs.getTestDB()
}
```
