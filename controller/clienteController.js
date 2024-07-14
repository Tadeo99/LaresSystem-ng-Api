// const clienteModel = require('../model/clienteModel.js');
const { client, mysqlSequelize } = require("../src/database/connection.js");
const bcrypt = require("bcryptjs");
const ResponseVO = require("../model/ResponseVO.js");
const registroUsuario = require('../repository/registroUsuario.js');
const loginUsuario = require('../repository/login.js');
const changePasswordUser = require("../repository/cambiarContraseña.js");
const validarUsuario = require("../repository/validarUsuario.js");
//validar Registro Usuario
exports.getValidaRegistro = async (req, res) => {
  const documentoCliente = req.query.numeroDocumento;
  const tipoDoc = req.query.tipoDocumento;
  console.log(documentoCliente + tipoDoc);
  const query = `
    SELECT DISTINCT
        pg.numero_contrato,
        pg.documento_cliente,
        cli.tipo_documento,
        pg.nombre_proyecto,
        pg.nombre,
        UPPER(pg.nombres_cliente) || ' ' || UPPER(pg.Apellidos_Cliente) AS Cliente,
        CASE WHEN proc.Proyecto = 'PLA' THEN proc.Lote ELSE proc.Manzana END AS Manzana,
        CASE WHEN proc.Proyecto = 'PLA' THEN proc.Manzana ELSE proc.Lote END AS Lote,
        pg.estado,
        pg.saldo,
        pg.fecha_vcto,
        CASE
            WHEN pg.nombre LIKE '%-%' AND POSITION('-' IN TRIM(pg.nombre)) > 1 THEN LPAD(TRIM(REVERSE(SPLIT_PART(REVERSE(pg.nombre), '-', 1))), 3 , '0')
            WHEN TRIM(REVERSE(SPLIT_PART(REVERSE(pg.nombre), ' ', 1))) BETWEEN '0' AND '999' THEN LPAD(TRIM(REVERSE(SPLIT_PART(REVERSE(pg.nombre), ' ', 1))), 3 , '0')
            ELSE ''
        END AS numero_couta,
        cli.telefono,
        cli.celulares
    FROM
        lares.pagos pg
        LEFT JOIN (
            SELECT DISTINCT
                proceso.numero_contrato,
                SPLIT_PART(proceso.codigo_unidad, '-', 1) AS Proyecto,
                SPLIT_PART(proceso.codigo_unidad, '-', 3) AS Manzana,
                SPLIT_PART(proceso.codigo_unidad, '-', 4) AS Lote
            FROM 
                lares.procesos proceso
        ) AS proc ON pg.numero_contrato = proc.numero_contrato
        LEFT JOIN lares.clientes cli ON pg.documento_cliente = cli.documento
    WHERE
        pg.numero_contrato NOT IN (
            SELECT DISTINCT ISNULL(pro.numero_contrato, '') 
            FROM lares.procesos pro 
            WHERE pro.nombre = 'Anulacion'
        )
        AND pg.numero_contrato IN (
            SELECT DISTINCT p.numero_contrato
            FROM lares.pagos p
            INNER JOIN lares.procesos pr ON p.numero_contrato = pr.numero_contrato
            WHERE p.numero_contrato IS NOT NULL 
            AND p.numero_contrato <> ''
            AND (
                (pr.tipo_cronograma = 'Hipotecario' AND (
                    (p.etiqueta = 'Separación' AND p.estado = 'pagado') 
                    OR 
                    (p.etiqueta = 'Cuota Inicial' AND p.estado = 'pagado')
                )) 
                OR 
                (pr.tipo_cronograma = 'Financiamiento' AND (
                    (p.etiqueta = 'separación' AND p.estado = 'pagado') 
                    OR 
                    (LOWER(p.etiqueta) = 'firma de contrato' AND p.estado = 'pagado')
                ))
            )
        )
        AND pg.numero_contrato NOT IN (
            SELECT DISTINCT fn.numero_contrato 
            FROM lares.finanzas fn 
            WHERE fn.tipo = 'Resolución'
        )
        AND pg.numero_contrato NOT IN (
            SELECT DISTINCT ISNULL(proceso.numero_contrato, '')
            FROM lares.procesos proceso
            WHERE LOWER(proceso.nombre) = 'anulacion' 
            AND LOWER(proceso.nombre_flujo) IN ('resolución por morosidad casas', 'resolución a solicitud del cliente casas')
        )
        AND pg.tipo_cronograma <> 'cronograma de ahorros'
        AND pg.documento_cliente = $1
        AND cli.tipo_documento = $2
        AND pg.motivo_inactivo IS NULL LIMIT 1;
`;

  // Realizar la consulta a la base de datos
  client.query(query, [documentoCliente, tipoDoc], async (error, resultado) => {
    if (error) {
      console.error(error.message);
      const errorResponse = ResponseVO.error(
        "ERR001",
        "Error al obtener los datos"
      );
      return res.status(500).json(errorResponse);
    }
    const primerRegistro = resultado.rows[0];
    // Verificar si se encontraron registros
    if (resultado.rows.length > 0) {
      // Si se encontraron registros, llamar a la función registroUsuario
      try {
        await registroUsuario({
          documento_cliente: primerRegistro.documento_cliente,
          tipo_documento: primerRegistro.tipo_documento,
          nombre: primerRegistro.nombre,
          cliente: primerRegistro.cliente,
          telefono: primerRegistro.telefono,
          celulares: primerRegistro.celulares,
          usuario: primerRegistro.nombre,
          password: primerRegistro.documento_cliente  // o usa algún otro campo como contraseña
        });

        const newUserResponse = ResponseVO.success(null, "Gracias por activar su cuenta. Su contraseña es su número de documento de identidad. Por favor, cambie su contraseña en el primer inicio de sesión.", null);
        return res.json(newUserResponse);
      } catch (regError) {
        console.error("Error al registrar usuario:", regError.message);
        const errorResponse = ResponseVO.error("ERR002", regError.message);
        return res.status(200).json(errorResponse);
      }
    } else {
      // Si no se encontraron registros, retornar un mensaje indicando que el cliente no está registrado
      const noRecordsResponse = ResponseVO.error("ERR002", "El cliente no se encuentra registrado");
      return res.json(noRecordsResponse);
    }
  });
};


//prueba conexion mysql
exports.getCurrentTimeMySQL = async (req, res) => {
  try {
    const [results, metadata] = await mysqlSequelize.query("SELECT * from usuario ");
    const successResponse = ResponseVO.success(results, null, null);
    res.json(successResponse);
  } catch (error) {
    const errorResponse = ResponseVO.error(
      "ERR004",
      "Error retrieving time from MySQL"
    );
    res.status(500).json(errorResponse);
  }
};

exports.getObtenerProyectoUrl = async (req, res) => {
  const codigo = req.query.codigo;
  console.log("Código recibido:", codigo);
  try {
    let query = "SELECT * FROM proyectos WHERE codigo = '" + codigo + "'";
    const [results] = await mysqlSequelize.query(query);
    const successResponse = ResponseVO.success(results, null, null);
    res.json(successResponse);
  } catch (error) {
    console.error("Error en la consulta:", error);
    const errorResponse = ResponseVO.error(
      "ERR004",
      "Error retrieving data from MySQL"
    );
    res.status(500).json(errorResponse);
  }
};

// Obetener lista de clientes
exports.getClientes = (req, res) => {
  const query = `
    SELECT DISTINCT
        pg.numero_contrato,
        pg.documento_cliente,
        cli.tipo_documento,
        pg.nombre_proyecto,
        pg.nombre,
        UPPER(pg.nombres_cliente) || ' ' || UPPER(pg.Apellidos_Cliente) AS Cliente,
        CASE WHEN proc.Proyecto = 'PLA' THEN proc.Lote ELSE proc.Manzana END AS Manzana,
        CASE WHEN proc.Proyecto = 'PLA' THEN proc.Manzana ELSE proc.Lote END AS Lote,
        pg.estado,
        pg.saldo,
        pg.fecha_vcto,
        CASE
            WHEN pg.nombre LIKE '%-%' AND POSITION('-' IN TRIM(pg.nombre)) > 1 THEN LPAD(TRIM(REVERSE(SPLIT_PART(REVERSE(pg.nombre), '-', 1))), 3 , '0')
            WHEN TRIM(REVERSE(SPLIT_PART(REVERSE(pg.nombre), ' ', 1))) BETWEEN '0' AND '999' THEN LPAD(TRIM(REVERSE(SPLIT_PART(REVERSE(pg.nombre), ' ', 1))), 3 , '0')
            ELSE ''
        END AS numero_couta,
        cli.telefono,
        cli.celulares
    FROM
        lares.pagos pg
        LEFT JOIN (
            SELECT DISTINCT
                proceso.numero_contrato,
                SPLIT_PART(proceso.codigo_unidad, '-', 1) AS Proyecto,
                SPLIT_PART(proceso.codigo_unidad, '-', 3) AS Manzana,
                SPLIT_PART(proceso.codigo_unidad, '-', 4) AS Lote
            FROM 
                lares.procesos proceso
        ) AS proc ON pg.numero_contrato = proc.numero_contrato
        LEFT JOIN lares.clientes cli ON pg.documento_cliente = cli.documento
    WHERE
        pg.numero_contrato NOT IN (
            SELECT DISTINCT ISNULL(pro.numero_contrato, '') 
            FROM lares.procesos pro 
            WHERE pro.nombre = 'Anulacion'
        )
        AND pg.numero_contrato IN (
            SELECT DISTINCT p.numero_contrato
            FROM lares.pagos p
            INNER JOIN lares.procesos pr ON p.numero_contrato = pr.numero_contrato
            WHERE p.numero_contrato IS NOT NULL 
            AND p.numero_contrato <> ''
            AND (
                (pr.tipo_cronograma = 'Hipotecario' AND (
                    (p.etiqueta = 'Separación' AND p.estado = 'pagado') 
                    OR 
                    (p.etiqueta = 'Cuota Inicial' AND p.estado = 'pagado')
                )) 
                OR 
                (pr.tipo_cronograma = 'Financiamiento' AND (
                    (p.etiqueta = 'separación' AND p.estado = 'pagado') 
                    OR 
                    (LOWER(p.etiqueta) = 'firma de contrato' AND p.estado = 'pagado')
                ))
            )
        )
        AND pg.numero_contrato NOT IN (
            SELECT DISTINCT fn.numero_contrato 
            FROM lares.finanzas fn 
            WHERE fn.tipo = 'Resolución'
        )
        AND pg.numero_contrato NOT IN (
            SELECT DISTINCT ISNULL(proceso.numero_contrato, '')
            FROM lares.procesos proceso
            WHERE LOWER(proceso.nombre) = 'anulacion' 
            AND LOWER(proceso.nombre_flujo) IN ('resolución por morosidad casas', 'resolución a solicitud del cliente casas')
        )
        AND pg.tipo_cronograma <> 'cronograma de ahorros'
        AND pg.motivo_inactivo IS NULL;
`;
  // const query = " select distinct pg.numero_contrato, pg.documento_cliente, pg.nombre_proyecto, pg.documento_cliente, UPPER(pg.nombres_cliente) || ' ' || UPPER(pg.Apellidos_Cliente) AS Cliente, Case When proc.Proyecto = 'PLA' Then proc.Lote Else Manzana End as Manzana, Case When proc.Proyecto = 'PLA' Then proc.Manzana Else Lote End as Lote, pg.estado, pg.saldo, pg.fecha_vcto, Case when pg.nombre like '%-%' and POSITION('-' IN trim(pg.nombre)) > 1 then LPAD( trim(reverse(SPLIT_PART(reverse( pg.nombre), '-', 1))), 3 , '0')  when trim(reverse(SPLIT_PART(reverse( pg.nombre), ' ', 1))) between 0 and 999 then LPAD(trim(reverse(SPLIT_PART(reverse( pg.nombre), ' ', 1))), 3 , '0') Else '' end as numero_couta,cli.telefono, cli.celulares FROM lares.pagos pg left join (select distinct proceso.numero_contrato, split_part(proceso.codigo_unidad, '-',1) AS Proyecto, split_part(proceso.codigo_unidad, '-',3) AS Manzana, split_part(proceso.codigo_unidad, '-',4) AS Lote FROM lares.procesos proceso) AS proc ON pg.numero_contrato = proc.numero_contrato left join lares.clientes cli ON pg.documento_cliente  = cli.documento and pg.numero_contrato not IN (SELECT DISTINCT ISNULL(pro.numero_contrato,'') FROM lares.procesos pro WHERE pro.nombre IN ('Anulacion')) and pg.numero_contrato IN (SELECT DISTINCT p.numero_contrato FROM lares.pagos p INNER JOIN lares.procesos pr ON p.numero_contrato = pr.numero_contrato WHERE p.numero_contrato IS NOT NULL AND p.numero_contrato <> ''AND ((pr.tipo_cronograma = 'Hipotecario' AND ((p.etiqueta = 'Separación' AND p.estado = 'pagado') OR (p.etiqueta = 'Cuota Inicial' AND p.estado = 'pagado'))) OR (pr.tipo_cronograma = 'Financiamiento' AND ((p.etiqueta = 'separación' AND p.estado = 'pagado') OR (LOWER(p.etiqueta) = 'firma de contrato' AND p.estado = 'pagado')))))and pg.numero_contrato not in (select distinct fn.numero_contrato from  lares.finanzas fn where fn.tipo ='Resolución') and pg.numero_contrato not in(SELECT DISTINCT ISNULL(proceso.numero_contrato,'')FROM lares.procesos proceso where LOWER(nombre) ='anulacion' and LOWER(nombre_flujo) in ('resolución por morosidad casas', 'resolución a solicitud del cliente casas')) and pg.tipo_cronograma <> 'cronograma de ahorros'and pg.motivo_inactivo is NULL;";

  // Obtener usuarios
  client.query(query, (error, resultado) => {
    if (error) return console.error(error.message);

    rowsSQL = resultado.rows.length;
    if (rowsSQL > 0) {
      res.json(resultado);
      console.log(`Usuarios encontrados: ${rowsSQL}`);
    } else {
      res.json("No hay registros");
    }
  });
};


// Obetener lista de clientes
exports.getClientesPagos = (req, res) => {
  const query = `
    select distinct
	pg.numero_contrato,
	pg.nombre_proyecto,
	pg.documento_cliente,
	UPPER(pg.nombres_cliente) || ' ' || UPPER(pg.Apellidos_Cliente) AS Cliente,
    Case When proc.Proyecto = 'PLA' Then proc.Lote Else Manzana End as Manzana,
	Case When proc.Proyecto = 'PLA' Then proc.Manzana Else Lote End as Lote,
    pg.estado,
    pg.saldo,
    pg.fecha_vcto,
    --pg.nombre,
    Case when pg.nombre like '%-%' and POSITION('-' IN trim(pg.nombre)) > 1 then LPAD( trim(reverse(SPLIT_PART(reverse( pg.nombre), '-', 1))), 3 , '0')
	   when trim(reverse(SPLIT_PART(reverse( pg.nombre), ' ', 1))) between 0 and 999 then LPAD( trim(reverse(SPLIT_PART(reverse( pg.nombre), ' ', 1))), 3 , '0')
	 Else '' end as numero_couta,
    cli.telefono,
    cli.celulares
FROM
    lares.pagos pg
    left join
    (
	select distinct
        proceso.numero_contrato,
		split_part(proceso.codigo_unidad, '-',1) AS Proyecto,
        split_part(proceso.codigo_unidad, '-',3) AS Manzana,
        split_part(proceso.codigo_unidad, '-',4) AS Lote
    FROM
        lares.procesos proceso
    ) AS proc ON pg.numero_contrato = proc.numero_contrato
    left join lares.clientes cli ON pg.documento_cliente  = cli.documento
where pg.fecha_vcto <= TO_CHAR(LAST_DAY(CURRENT_DATE), 'YYYY-MM-DD') and pg.estado ='pendiente'
and pg.numero_contrato not IN
    (
    SELECT DISTINCT ISNULL(pro.numero_contrato,'') FROM lares.procesos pro WHERE pro.nombre IN ('Anulacion')
    )
and pg.numero_contrato IN
    (
    SELECT DISTINCT
        p.numero_contrato
    FROM
        lares.pagos p
    INNER JOIN
        lares.procesos pr ON p.numero_contrato = pr.numero_contrato
    WHERE
        p.numero_contrato IS NOT NULL
        AND p.numero_contrato <> ''
        AND
        (
            (pr.tipo_cronograma = 'Hipotecario' AND (
                (p.etiqueta = 'Separación' AND p.estado = 'pagado')
                OR
                (p.etiqueta = 'Cuota Inicial' AND p.estado = 'pagado')
            ))
            OR
            (pr.tipo_cronograma = 'Financiamiento' AND (
                (p.etiqueta = 'separación' AND p.estado = 'pagado')
                OR
                (LOWER(p.etiqueta) = 'firma de contrato' AND p.estado = 'pagado')
            ))
        )
    )
    and pg.numero_contrato not in (
    	select
    		distinct fn.numero_contrato
        from  lares.finanzas fn
		where fn.tipo ='Resolución'
    )
    and pg.numero_contrato not in
    (
	SELECT
        DISTINCT ISNULL(proceso.numero_contrato,'')
    FROM lares.procesos proceso
    where LOWER(nombre) ='anulacion' and LOWER(nombre_flujo) in ('resolución por morosidad casas', 'resolución a solicitud del cliente casas')
    )
    AND pg.numero_contrato = 'VE0026'
    and pg.tipo_cronograma <> 'cronograma de ahorros'
    and pg.motivo_inactivo is NULL;
`;

  // Obtener usuarios y pagos
  client.query(query, (error, resultado) => {
    if (error) return console.error(error.message);

    rowsSQL = resultado.rows.length;
    if (rowsSQL > 0) {
      res.json(resultado);
      console.log(`Usuarios encontrados: ${rowsSQL}`);
    } else {
      res.json("No hay registros");
    }
  });
};


// Login
exports.login = async (req, res) => {
  const { tipoDocumento, numeroDocumento, password } = req.body;
  console.log(tipoDocumento);
  try {
    const { user, token } = await loginUsuario(tipoDocumento, numeroDocumento, password);
    user.password = null;
    user.cliente = cleanString(user.cliente);
    const successResponse = ResponseVO.successLogin(user, "Inicio de sesión exitoso", user.mensaje,token);
    return res.json(successResponse);
  } catch (error) {
    console.error("Error al iniciar sesión:", error.message);
    const errorResponse = ResponseVO.error("ERR002", error.message);
    return res.status(200).json(errorResponse);
  }
};

function cleanString(str) {
  // Verificar si str es una cadena de texto y no es null ni undefined
  if (typeof str === 'string' && str !== null && str !== undefined) {
    // Utilizar una expresión regular más específica para reemplazar los caracteres no deseados
    let cleanedStr = str.replace(/●\s*|\t/g, '').trim();
    return cleanedStr;
  } else {
    // Si str no es una cadena de texto o es null/undefined, devolver una cadena vacía
    return '';
  }
}

// registro
exports.signUp = async (req, res) => {
  try {
    const { nombre, password } = req.body;

    // Verificar si el usuario ya existe en la base de datos
    const [existingUser] = await client
      .promise()
      .query("SELECT * FROM usuarios WHERE nombre = ?", [nombre]);
    if (existingUser.length > 0) {
      return res
        .status(400)
        .json({ message: "El correo electrónico ya está registrado" });
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar un nuevo usuario en la base de datos
    console.log(`Este es el nombre: ${nombre}`);
    console.log(`Este es el password: ${password}`);
    await client
      .promise()
      .query("INSERT INTO usuarios (nombre, password) VALUES (?, ?)", [
        nombre,
        hashedPassword,
      ]);

    res.status(201).json({ message: "Usuario registrado correctamente" });
  } catch (error) {
    console.error("Error al registrar usuario:", error);
    res
      .status(500)
      .json({ message: "Error del servidor al registrar usuario" });
  }
};

// Cambiar contraseña
exports.changePassword = async (req, res) => {
  const { tipoDocumento, numeroDocumento, passwordActual, nuevaPassword } = req.body;
  try {
    await changePasswordUser(tipoDocumento, numeroDocumento, passwordActual, nuevaPassword);
    const successResponse = ResponseVO.success(null, "Contraseña cambiada exitosamente", null);
    return res.json(successResponse);
  } catch (error) {
    console.error("Error al cambiar contraseña:", error.message);
    const errorResponse = ResponseVO.error("ERR003", error.message);
    return res.status(200).json(errorResponse);
  }
};

// Validar Usuario
  exports.getUserValidation = async (req, res) => {
  const numeroDocumento = req.query.numeroDocumento;
  const tipoDocumento = req.query.tipoDocumento;
  console.log(numeroDocumento + tipoDocumento);
  try {
    const user = await validarUsuario(tipoDocumento, numeroDocumento);

    // Si el usuario se autentica correctamente, envía una respuesta exitosa
    const successResponse = ResponseVO.success(null, user.message, null);
    return res.json(successResponse);
  } catch (error) {
    // Si ocurre un error durante la autenticación, envía una respuesta de error
    console.error("Error al iniciar sesión:", error.message);
    const errorResponse = ResponseVO.error("ERR002", error.message);
    return res.status(200).json(errorResponse);
  }
};