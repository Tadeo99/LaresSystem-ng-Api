const ResponseVO = require("../model/ResponseVO.js");
const makeApiRequest = require("../repository/googleDrive.js");

exports.getObtenerContratos = async (req, res) => {
  const codigo = req.query.codigo;
  console.error("codigo", codigo);
  try {
    const url = await makeApiRequest(codigo);
    console.error("url", url);
    if (url && url.includes("Error")) {
      const errorResponse = ResponseVO.error("999", url);
      return res.status(200).json(errorResponse);
    }
    const successResponse = ResponseVO.success(null, url, null);
    res.json(successResponse);
  } catch (error) {
    const errorResponse = ResponseVO.error(
      "ERR004",
      "Error getObtenerContratosL"
    );
    res.status(500).json(errorResponse);
  }
};
