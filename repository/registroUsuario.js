// services/registroUsuario.js
const bcrypt = require("bcryptjs");
const Usuario = require('../model/usuario.js');  // Ajusta la ruta según tu estructura de proyecto

async function registroUsuario(datosUsuario) {
  try {
    const { documento_cliente, tipo_documento, nombre, cliente, telefono, celulares, usuario, password } = datosUsuario;

    // Verificar si el usuario ya existe en la base de datos
    const existingUser = await Usuario.findOne({ 
      where: { 
        tipo_documento: tipo_documento,
        documento_cliente: documento_cliente
      } 
    });

    if (existingUser) {
      throw new Error("El usuario ya está registrado");
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar un nuevo usuario en la base de datos
    await Usuario.create({
      documento_cliente,
      tipo_documento,
      nombre,
      cliente,
      telefono,
      celulares,
      usuario,
      password: hashedPassword,
    });

    return;
  } catch (error) {
    throw error;
  }
}

module.exports = registroUsuario;