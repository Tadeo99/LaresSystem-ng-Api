const axios = require('axios');
const ResponseVO = require("../model/ResponseVO.js");
require('dotenv').config();
exports.getObtenerProyectoUrl = async (req, res) => {
  const idUnidad = req.query.idUnidad;
  process.env.USER
  const ulr = process.env.URL_ETER;
  const apiUrl = ulr + idUnidad + '/images';
  console.error(apiUrl);
  const authToken = process.env.TOKEK_ETER;
  try {
    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': authToken
      }
    });

    // Extraer name y path_url
    const images = response.data.data.map(image => ({
      name: image.attributes.name,
      path_url: image.attributes.path_url
    }));

    if (images.length === 0) {
      // No hay datos, retornar mensaje de proyecto sin lotes
      const noDataResponse = ResponseVO.error("999","El contrato no tiene lote registrado");
      return res.json(noDataResponse);
    }

    // Crear una respuesta de éxito con los datos extraídos
    const successResponse = ResponseVO.success(images, images, null);
    res.json(successResponse);
  } catch (error) {
    //console.error("Error fetching data from API:", error);
    // Crear una respuesta de error
    const errorResponse = ResponseVO.error(
      "ERR004",
      "Error retrieving data from the external API"
    );
    res.status(500).json(errorResponse);
  }
};
