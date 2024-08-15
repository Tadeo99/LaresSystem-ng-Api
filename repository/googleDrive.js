const { google } = require('googleapis');
const axios = require('axios');
require('dotenv').config();
// Configura los parámetros de autenticación
const client = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_ID,
  null,
  process.env.GOOGLE_PRIVATE_KEY,
  ['https://www.googleapis.com/auth/drive.readonly'] // Cambié a 'drive.readonly' ya que es más específico para Google Drive
);

// Obtener un token de acceso
async function getAccessToken() {
  try {
    const tokens = await client.authorize();
    return tokens.access_token;
  } catch (error) {
    console.error('Error al obtener el token de acceso:', error);
    throw error;
  }
}

// Función para hacer la solicitud a la API de Google Drive
async function makeApiRequest(fileName,idCarpeta) {
  try {
    const token = await getAccessToken();
    // Construye la URL con el nombre del archivo dinámico
    const folderId = idCarpeta; // ID de la carpeta
    const query = `'${folderId}' in parents and name='${encodeURIComponent(fileName)}' and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/gif' or mimeType='application/pdf')`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webContentLink)`;

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    // Verifica si se obtuvo algún archivo
    if (response.data.files.length > 0) {
      const file = response.data.files[0];
      if (file) {
        const id = file.id;
        return 'https://drive.google.com/file/d/' + id + '/view'; // Devuelve el enlace para descargar el PDF
      } else {
        return 'Error: El archivo esta vacio o no existe';
      }
    } else {
      return 'Error: No se encontro el archivo ' + fileName;
    }
  } catch (error) {
    console.error('Error al hacer la solicitud a la API:', error);
    return 'Error al hacer la solicitud a la API:', error;
  }
}

module.exports = makeApiRequest;
