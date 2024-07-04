// services/loginUsuario.js
const bcrypt = require("bcryptjs");
const Usuario = require('../model/usuario.js');  // Ajusta la ruta según tu estructura de proyecto
const jwt = require('jsonwebtoken');
const SECRET_KEY = 'EMPRESA_ERR_GENERAL'; 
async function loginUsuario(tipo_documento, documento_cliente, password) {
  try {
    // Buscar al usuario en la base de datos
    const user = await Usuario.findOne({
      where: {
        tipo_documento: tipo_documento,
        documento_cliente: documento_cliente,
      },
    });

    // Verificar si se encontró el usuario
    if (!user) {
      throw new Error("Usuario no encontrado");
    }

    // Verificar la contraseña
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      throw new Error("Contraseña incorrecta");
    }

    const ferstValidation = await bcrypt.compare(
      documento_cliente,
      user.password
    );
    if (passwordMatch === ferstValidation) {
      user.mensaje = "CHANGES PASSWORD";
    }// Generar el token JWT
    const token = jwt.sign(
      { userId: user.id, documento_cliente: user.documento_cliente },
      SECRET_KEY,
      { expiresIn: "5m" } // Tiempo de expiración del token
    );
    return { user, token };
  } catch (error) {
    throw error;
  }
}

module.exports = loginUsuario;