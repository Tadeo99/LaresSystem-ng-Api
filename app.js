// Variables
const express = require('express');
const cors = require('cors');
const app = express();
const router = require('./routes/clienteRoute.js');
const bodyParser = require('body-parser');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use('/', router);

app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' http://localhost:4200;");
    next();
});

app.listen(6500, () => {
    console.log('Servidor activo');
});

// Consulta para Buscar clientes/usuarios
// app.get('/clientes/busqueda/:id', (req, res) => {
//     const userId = req.params.id;
//     const query = `SELECT * FROM lares.pagos WHERE numero_contrato = '${userId}'`;
//     console.log(query);

//     client.query(query, (error, resultado) => {
//         if (error) {
//           res.status(500).json({ error: 'Error al buscar el usuario.' });
//           return;
//         }

//         res.json(resultado);
//     });
// });