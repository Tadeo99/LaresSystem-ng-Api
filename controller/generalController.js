// const clienteModel = require('../model/clienteModel.js');
const { client, mysqlSequelize } = require("../src/database/connection.js");
const bcrypt = require("bcryptjs");
const ResponseVO = require("../model/ResponseVO.js");
const registroUsuario = require("../repository/registroUsuario.js");
const loginUsuario = require("../repository/login.js");
const changePasswordUser = require("../repository/cambiarContraseña.js");
const validarUsuario = require("../repository/validarUsuario.js");

exports.getObtenerContrato = async (req, res) => {
  const documentoCliente = req.query.numeroDocumento;
  const tipoDoc = req.query.tipoDocumento;
  console.log(documentoCliente + tipoDoc);
  const query = `
      SELECT 
    numero_contrato,
    documento_cliente,
    tipo_documento,
    nombre_proyecto,
    nombre,
    Cliente,
    Manzana,
    Lote,
    telefono,
    celulares
FROM (
    SELECT 
        pg.numero_contrato,
        pg.documento_cliente,
        cli.tipo_documento,
        pg.nombre_proyecto,
        pg.nombre,
        UPPER(pg.nombres_cliente) || ' ' || UPPER(pg.Apellidos_Cliente) AS Cliente,
        CASE WHEN proc.Proyecto = 'PLA' THEN proc.Lote ELSE proc.Manzana END AS Manzana,
        CASE WHEN proc.Proyecto = 'PLA' THEN proc.Manzana ELSE proc.Lote END AS Lote,
        cli.telefono,
        cli.celulares,
        ROW_NUMBER() OVER (PARTITION BY pg.numero_contrato ORDER BY pg.numero_contrato) AS row_num
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
) AS sub
WHERE row_num = 1;
  `;

  // Realizar la consulta a la base de datos
  client.query(query, [documentoCliente, tipoDoc], async (error, resultado) => {
    if (error) {
      console.error(error.message);
      const errorResponse = ResponseVO.error(
        "ERR001",
        "Error al obtener los datos del cantrato"
      );
      return res.status(500).json(errorResponse);
    }
    const cleanedRows = resultado.rows.map(row => {
        return {
          numero_contrato: cleanString(row.numero_contrato),
          documento_cliente: cleanString(row.documento_cliente),
          tipo_documento: cleanString(row.tipo_documento),
          nombre_proyecto: cleanString(row.nombre_proyecto),
          nombre: cleanString(row.nombre),
          Cliente: cleanString(row.cliente),
          Manzana: cleanString(row.manzana),
          Lote: cleanString(row.lote),
          telefono: cleanString(row.telefono),
          celulares: cleanString(row.celulares)
        };
      });
    const newUserResponse = ResponseVO.success(cleanedRows, null, null);
    res.set('Content-Type', 'application/json; charset=utf-8');
    return res.json(newUserResponse);
  });
};

// Función para limpiar una cadena de texto
function cleanString(str) {
    // Verificar si str es una cadena de texto y no es null ni undefined
    if (typeof str === 'string' && str !== null && str !== undefined) {
      // Utilizar una expresión regular más específica para reemplazar los caracteres no deseados
      let cleanedStr = str.replace(/[\u2022\t]/g, '').replace(/●/g, '').trim();
      return cleanedStr;
    } else {
      // Si str no es una cadena de texto o es null/undefined, devolver una cadena vacía
      return '';
    }
  }

  exports.getObtenerProximaLetra = async (req, res) => {
    const documentoCliente = req.query.numeroDocumento;
    const tipoDoc = req.query.tipoDocumento;
    const numero_contrato = req.query.numero_contrato;
    const query = `
        select distinct
    proc.numero_contrato,
    Case when pg.nombre like '%-%' and POSITION('-' IN trim(pg.nombre)) > 1 then LPAD( trim(reverse(SPLIT_PART(reverse( pg.nombre), '-', 1))), 3 , '0') 
	   when trim(reverse(SPLIT_PART(reverse( pg.nombre), ' ', 1))) between 0 and 999 then LPAD( trim(reverse(SPLIT_PART(reverse( pg.nombre), ' ', 1))), 3 , '0') 
	 Else '' end as numero_couta,
    pg.saldo,
    pg.fecha_vcto
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
where pg.fecha_vcto <= TO_CHAR(LAST_DAY(CURRENT_DATE), 'YYYY-MM-DD') 
and pg.estado ='pendiente'
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
    and pg.tipo_cronograma <> 'cronograma de ahorros'
    and pg.motivo_inactivo is null
    AND pg.documento_cliente = $1
    AND cli.tipo_documento = $2
    AND pg.numero_contrato = $3
    order by pg.fecha_vcto asc ;
    `;
  
    // Realizar la consulta a la base de datos
    client.query(query, [documentoCliente, tipoDoc,numero_contrato], async (error, resultado) => {
      if (error) {
        console.error(error.message);
        const errorResponse = ResponseVO.error(
          "ERR001",
          "Error al obtener los datos del cantrato"
        );
        return res.status(500).json(errorResponse);
      }
      const newUserResponse = ResponseVO.success(resultado.rows, null, null);
      res.set('Content-Type', 'application/json; charset=utf-8');
      return res.json(newUserResponse);
    });
  };

exports.getObtenerUltimosPagos = async (req, res) => {
    const documentoCliente = req.query.numeroDocumento;
    const tipoDoc = req.query.tipoDocumento;
    const numero_contrato = req.query.numero_contrato;
    const query = `
select distinct
    pg.numero_contrato,
    Case when pg.nombre like '%-%' and POSITION('-' IN trim(pg.nombre)) > 1 then LPAD( trim(reverse(SPLIT_PART(reverse( pg.nombre), '-', 1))), 3 , '0') 
	   when trim(reverse(SPLIT_PART(reverse( pg.nombre), ' ', 1))) between 0 and 999 then LPAD( trim(reverse(SPLIT_PART(reverse( pg.nombre), ' ', 1))), 3 , '0') 
	 Else '' end as numero_couta,
    pg.monto_pagado,
    pg.fecha_vcto
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
where pg.fecha_vcto >= date_trunc('MONTH', CURRENT_DATE) - interval '2 month' 
and pg.estado ='pagado'
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
   and pg.tipo_cronograma <> 'cronograma de ahorros'
   AND pg.documento_cliente = $1
   AND cli.tipo_documento = $2
   AND pg.numero_contrato = $3
   and pg.motivo_inactivo is null
   order by pg.fecha_vcto desc limit 2;
    `;
    // Realizar la consulta a la base de datos
    client.query(query, [documentoCliente, tipoDoc,numero_contrato], async (error, resultado) => {
      if (error) {
        console.error(error.message);
        const errorResponse = ResponseVO.error(
          "ERR001",
          "Error al obtener los datos del ultimo pago"
        );
        return res.status(500).json(errorResponse);
      }
      const newUserResponse = ResponseVO.success(resultado.rows, null, null);
      res.set('Content-Type', 'application/json; charset=utf-8');
      return res.json(newUserResponse);
    });
  };


exports.getObtenerHistorial = async (req, res) => {
    const documentoCliente = req.query.numeroDocumento;
    const tipoDoc = req.query.tipoDocumento;
    const numero_contrato = req.query.numero_contrato;
    const query = `
SELECT distinct
pg.nombre,
pg.saldo,
pg.interes_compensatorio,
pg.mora,
pg.fecha_vcto,
pg.monto_pagado,
pg.fecha_pago,
pg.documento_cliente,
pg.numero_contrato,
pg.monto_programado,
pg.estado
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
    AND pg.motivo_inactivo IS null
   	AND pg.documento_cliente = $1
    AND cli.tipo_documento = $2
    AND pg.numero_contrato = $3
   	order by pg.fecha_vcto asc ;
    `;
    // Realizar la consulta a la base de datos
    client.query(query, [documentoCliente, tipoDoc,numero_contrato], async (error, resultado) => {
      if (error) {
        console.error(error.message);
        const errorResponse = ResponseVO.error(
          "ERR001",
          "Error al obtener los datos del ultimo pago"
        );
        return res.status(500).json(errorResponse);
      }
      const newUserResponse = ResponseVO.success(resultado.rows, null, null);
      res.set('Content-Type', 'application/json; charset=utf-8');
      return res.json(newUserResponse);
    });
  };


exports.getObtenerNumOperaciones = async (req, res) => {
  const numero_contrato = req.query.numero_contrato;
  const nombre_pago = req.query.nombre_pago;
  const query = `
    select  ROW_NUMBER() OVER () AS nro,numero_operacion  from lares.depositos where 1=1 
    and numero_contrato = $1 and nombre_pago = $2 ;
    `;
  // Realizar la consulta a la base de datos
  client.query(
    query,
    [numero_contrato,nombre_pago],
    async (error, resultado) => {
      if (error) {
        console.error(error.message);
        const errorResponse = ResponseVO.error(
          "ERR001",
          "Error al obtener los numeros de operaciones"
        );
        return res.status(200).json(errorResponse);
      }
      const newUserResponse = ResponseVO.success(resultado.rows, null, null);
      res.set("Content-Type", "application/json; charset=utf-8");
      return res.json(newUserResponse);
    }
  );
};