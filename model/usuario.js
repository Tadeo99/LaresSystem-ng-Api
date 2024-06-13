// models/Usuario.js
const { DataTypes } = require('sequelize');
const { mysqlSequelize } = require('../src/database/connection.js');

const Usuario = mysqlSequelize.define('Usuario', {
  documento_cliente: {
    type: DataTypes.STRING(20),
    allowNull: false,
    primaryKey: true,
  },
  tipo_documento: {
    type: DataTypes.STRING(10),
    allowNull: false,
    primaryKey: true,
  },
  nombre: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  cliente: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  telefono: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  celulares: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  usuario: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
}, {
  tableName: 'usuario',
  timestamps: false,
});

module.exports = Usuario;