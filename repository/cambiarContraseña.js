// services/loginUsuario.js
const bcrypt = require("bcryptjs");
const Usuario = require('../model/usuario.js');  // Ajusta la ruta según tu estructura de proyecto

async function changePasswordUser(tipo_documento, documento_cliente, passwordActual, nuevaPassword) {
  try {
    // Buscar al usuario en la base de datos
    const user = await Usuario.findOne({ 
      where: { 
        tipo_documento: tipo_documento,
        documento_cliente: documento_cliente
      } 
    });
    // Verificar si se encontró el usuario
    if (!user) {
      throw new Error("Usuario no encontrado");
    }
    // Verificar la contraseña
    const passwordMatch = await bcrypt.compare(passwordActual, user.password);
    if (!passwordMatch) {
      throw new Error("La contraseña actual es incorrecto");
    }

    const ferstValidation = await bcrypt.compare(nuevaPassword, user.password);
    if(ferstValidation){
      throw new Error("La contraseña anterior debe ser diferente a la contraseña actual ");
    }
    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(nuevaPassword, 10);
    // Actualizar usuario
    Usuario.update(
        { password: hashedPassword },
        { where: { documento_cliente: documento_cliente, tipo_documento: tipo_documento } }
      )
      .then(result => {
        // result es un array donde el primer elemento es el número de filas afectadas
        console.log(`${result[0]} filas actualizadas.`);
      })
      .catch(error => {
        console.error('Error al actualizar el password:', error);
      });

    // Devolver el usuario si la autenticación es exitosa
    return user;
  } catch (error) {
    throw error;
  }
}

module.exports = changePasswordUser;