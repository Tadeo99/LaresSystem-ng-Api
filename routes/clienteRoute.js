const express = require('express');
const router = express.Router();
const clienteController = require('../controller/clienteController');
const generalController = require('../controller/generalController');
const authMiddleware = require('../transversal/authMiddleware');
const generalJDBC = require('../controller/GenericJDBC');
const googleDrive = require('../controller/googleController');
//contrato
router.get('/contrat/url',authMiddleware,googleDrive.getObtenerContratos);

router.get('/lote/url',authMiddleware,generalJDBC.getObtenerProyectoUrl);
router.get('/validaRegistro',clienteController.getValidaRegistro);
router.get('/clientes', authMiddleware,clienteController.getClientes);
router.get('/clientesPagos', authMiddleware,clienteController.getClientesPagos);
router.get('/userValidation', authMiddleware,clienteController.getUserValidation);
router.post('/login', clienteController.login);
router.post('/signup', authMiddleware,clienteController.signUp);
router.put('/changePassword', authMiddleware,clienteController.changePassword);
//MYSQL
router.get('/current-time-mysql', clienteController.getCurrentTimeMySQL);
router.get('/proyect/url', clienteController.getObtenerProyectoUrl);
router.get('/payment/url', clienteController.getObtenerPagosUrl);
//general
router.get('/contract', authMiddleware,generalController.getObtenerContrato);
router.get('/status', authMiddleware,generalController.getObtenerEstado);
router.get('/nextLetter',authMiddleware, generalController.getObtenerProximaLetra);
router.get('/lastPayment', authMiddleware,generalController.getObtenerUltimosPagos);
router.get('/recordPayment', authMiddleware,generalController.getObtenerHistorial);
router.get('/numberOperations', authMiddleware,generalController.getObtenerNumOperaciones);
module.exports = router;