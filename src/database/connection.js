const { RedshiftDataClient, ListSchemasCommand } = require("@aws-sdk/client-redshift-data");
const redshiftDataApiClient = new RedshiftDataClient({ region: "us-east-1" });
const { Sequelize } = require('sequelize');

const { Client } = require('pg');
require('dotenv').config();

const client = new Client({

    user: process.env.USER,
    host: process.env.HOST,
    database: process.env.DATABASE,
    password: process.env.PASSWORD,
    port: process.env.PORT,
    charset: 'UTF8'
});

client.connect(function(err) {
    if (err) throw err;
    console.log("Connected!"); 
});; 

// Configuración de MySQL
const mysqlSequelize = new Sequelize(process.env.MYSQL_DATABASE, process.env.MYSQL_USER, process.env.MYSQL_PASSWORD, {
    host: process.env.MYSQL_HOST,
    dialect: 'mysql',
    port: process.env.MYSQL_PORT,
    dialectOptions: {
        connectTimeout: 60000 // 60 segundos de tiempo de espera
    }
});

mysqlSequelize.authenticate()
    .then(() => {
        console.log('Connected to MySQL!');
    })
    .catch(err => {
        console.error('Error connecting to MySQL', err);
    });

module.exports = { client, mysqlSequelize };