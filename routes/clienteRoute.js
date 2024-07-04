const express = require('express');
const router = express.Router();
const clienteController = require('../controller/clienteController');
const generalController = require('../controller/generalController');
const authMiddleware = require('../transversal/authMiddleware');

router.get('/validaRegistro',clienteController.getValidaRegistro);
router.get('/clientes', authMiddleware,clienteController.getClientes);
router.get('/clientesPagos', authMiddleware,clienteController.getClientesPagos);
router.get('/userValidation', authMiddleware,clienteController.getUserValidation);
router.post('/login', clienteController.login);
router.post('/signup', authMiddleware,clienteController.signUp);
router.put('/changePassword', authMiddleware,clienteController.changePassword);
router.get('/current-time-mysql', clienteController.getCurrentTimeMySQL);

//general
router.get('/contract', authMiddleware,generalController.getObtenerContrato);
router.get('/status', authMiddleware,generalController.getObtenerEstado);
router.get('/nextLetter',authMiddleware, generalController.getObtenerProximaLetra);
router.get('/lastPayment', authMiddleware,generalController.getObtenerUltimosPagos);
router.get('/recordPayment', authMiddleware,generalController.getObtenerHistorial);
router.get('/numberOperations', authMiddleware,generalController.getObtenerNumOperaciones);
module.exports = router;