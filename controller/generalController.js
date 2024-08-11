// const clienteModel = require('../model/clienteModel.js');
const { client, mysqlSequelize } = require("../src/database/connection.js");
const bcrypt = require("bcryptjs");
const ResponseVO = require("../model/ResponseVO.js");
const registroUsuario = require("../repository/registroUsuario.js");
const loginUsuario = require("../repository/login.js");
const changePasswordUser = require("../repository/cambiarContraseña.js");
const validarUsuario = require("../repository/validarUsuario.js");
const axios = require('axios');
require('dotenv').config();
exports.getObtenerContrato = async (req, res) => {
  const documentoCliente = req.query.numeroDocumento;
  const tipoDoc = req.query.tipoDocumento;
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
    celulares,
    codigo_unidad,
    id_unidad,
    codigo_proyecto
FROM (
    SELECT 
        pg.numero_contrato,
        pg.documento_cliente,
        cli.tipo_documento,
        pg.nombre_proyecto,
        pg.codigo_proyecto,
        pg.nombre,
        u.id as id_unidad,
        UPPER(pg.nombres_cliente) || ' ' || UPPER(pg.Apellidos_Cliente) AS Cliente,
        CASE WHEN proc.Proyecto = 'PLA' THEN proc.Lote ELSE proc.Manzana END AS Manzana,
        CASE WHEN proc.Proyecto = 'PLA' THEN proc.Manzana ELSE proc.Lote END AS Lote,
        proc.codigo_unidad,
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
                SPLIT_PART(proceso.codigo_unidad, '-', 4) AS Lote,
                codigo_unidad
            FROM 
                lares.procesos proceso
        ) AS proc ON pg.numero_contrato = proc.numero_contrato
        LEFT JOIN lares.clientes cli ON pg.documento_cliente = cli.documento
        LEFT JOIN lares.unidades u ON proc.codigo_unidad = u.codigo
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
      const errorResponse = ResponseVO.error(
        "ERR001",
        "Error al obtener los datos del contrato"
      );
      return res.status(500).json(errorResponse);
    }
    const cleanedRows = resultado.rows.map((row) => {
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
        celulares: cleanString(row.celulares),
        codigo_unidad: row.codigo_unidad,
        id_unidad: row.id_unidad,
        codigo_proyecto:row.codigo_proyecto
      };
    });
    const newUserResponse = ResponseVO.success(cleanedRows, null, null);
    res.set("Content-Type", "application/json; charset=utf-8");
    return res.json(newUserResponse);
  });
};

// Función para limpiar una cadena de texto
function cleanString(str) {
  // Verificar si str es una cadena de texto y no es null ni undefined
  if (typeof str === "string" && str !== null && str !== undefined) {
    // Utilizar una expresión regular más específica para reemplazar los caracteres no deseados
    let cleanedStr = str
      .replace(/[\u2022\t]/g, "")
      .replace(/●/g, "")
      .trim();
    return cleanedStr;
  } else {
    // Si str no es una cadena de texto o es null/undefined, devolver una cadena vacía
    return "";
  }
}

exports.getObtenerEstado = async (req, res) => {
  const numero_contrato = req.query.numero_contrato;
  const query = `
        SELECT
 numero_contrato,
 estado_letra
FROM (
    SELECT 
        p.numero_contrato,
        p.MontoCuotaInicial_Pagado,
        p.estado_letra,
        row_number() over(partition by p.numero_contrato order by Case When LOWER(estado_letra) ='resuelto' Then 1 When LOWER(estado_letra) ='pendiente' Then 2 Else 3 end) as id_orden_est
    FROM (
        SELECT 
            pago.numero_contrato,
            sumas.cuota_inicial + sumas.separacion+sumas.firma_contrato MontoCuotaInicial_Pagado,
            Case When pago.tipo_cronograma in ('cronograma de pagos', 'cronograma de ahorros') and pago.estado != 'pagado' and proceso.estado_anulacion ='Anulacion' Then 'Resuelto' 
    		When pago.tipo_cronograma ='cronograma de financiamiento' and pago.estado != 'pagado' and fn.tipo ='Resolución' Then 'Resuelto'
    		Else pago.estado End as estado_letra
        FROM lares.pagos pago
        LEFT JOIN 
    	lares.finanzas fn ON pago.numero_contrato = fn.numero_contrato and fn.tipo ='Resolución'
        INNER JOIN (
		    SELECT
		    *
		    , row_number() over(partition by numero_contrato order by Id_pri) as id_orden
		    FROM
		    (
			SELECT
	            process.nombre_proyecto,    
				process.codigo_unidad,
		        process.numero_contrato,
		        process.nombre,
		        split_part(process.codigo_unidad, '-',1) AS Proyecto,
		        split_part(process.codigo_unidad, '-',2) AS Etapa,
		        split_part(process.codigo_unidad, '-',3) AS Manzana,
		        split_part(process.codigo_unidad, '-',4) AS Lote,
		        process.nombre as estado_anulacion,
		        Case When LOWER(nombre) ='anulacion' and LOWER(nombre_flujo) ='resolución por morosidad casas' Then 1
				     When LOWER(nombre) ='venta' Then 2 Else 3 End as id_pri
		    FROM 
		        lares.procesos process
		    ) T1 where id_pri in(1,2)
		) AS proceso ON pago.numero_contrato = proceso.numero_contrato and proceso.id_orden =1
        INNER JOIN lares.clientes cliente ON pago.documento_cliente = cliente.documento
        INNER JOIN lares.unidades u on proceso.codigo_unidad = u.codigo
        LEFT JOIN (
            SELECT 
                p.numero_contrato,
                SUM(Case When LOWER(p.etiqueta) = 'cuota inicial' Then p.monto_pagado Else 0 End) AS cuota_inicial,
                SUM(Case When LOWER(p.etiqueta) = 'separación' Then p.monto_pagado Else 0 End) AS separacion,
                SUM(Case When LOWER(p.etiqueta) = 'firma de contrato' Then p.monto_pagado Else 0 End) AS firma_contrato
            FROM lares.pagos p
            WHERE p.monto_pagado <> 0
            --AND p.fecha_contrato IS NOT NULL
            AND p.numero_contrato IS NOT NULL
            AND p.numero_contrato <> ''
            GROUP BY p.numero_contrato
        ) AS sumas ON pago.numero_contrato = sumas.numero_contrato
		LEFT JOIN (
            SELECT 
                p.numero_contrato,
				SUM(saldo) saldo_pendiente
            FROM lares.pagos p
            WHERE p.fecha_contrato IS NOT NULL
            AND p.numero_contrato IS NOT NULL
            AND p.numero_contrato <> ''
            GROUP BY p.numero_contrato
        ) AS sp ON pago.numero_contrato = sp.numero_contrato        
        LEFT JOIN (
            SELECT
                p.numero_contrato,
                SUM(Case When p.etiqueta = 'Bono Techo Propio' Then p.saldo Else 0 End) AS bono_techo_propio
            FROM lares.pagos p
            WHERE  p.etiqueta = 'Bono Techo Propio'
            AND p.numero_contrato IS NOT NULL
            AND p.numero_contrato <> ''
            AND (p.tipo_cronograma= 'cronograma de pagos' or p.tipo_cronograma ='cronograma de financiamiento')
            GROUP BY p.numero_contrato
        ) AS bono ON pago.numero_contrato = bono.numero_contrato
        WHERE pago.numero_contrato IS NOT NULL
        AND pago.numero_contrato <> ''
        ORDER BY pago.fecha_contrato DESC
    ) AS p
) AS subquery
WHERE id_orden_est =1 and isnull(MontoCuotaInicial_Pagado,0) > 0
and numero_contrato = $1
GROUP BY
    numero_contrato,
   	estado_letra ;
    `;
  client.query(query, [numero_contrato], async (error, resultado) => {
    if (error) {
      const errorResponse = ResponseVO.error(
        "ERR001",
        "Error al obtener el estado del contrato"
      );
      return res.status(200).json(errorResponse);
    }
    const newUserResponse = ResponseVO.success(null, resultado.rows, null);
    res.set("Content-Type", "application/json; charset=utf-8");
    return res.json(newUserResponse);
  });
};

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
    pg.fecha_vcto,
    replace(pg.moneda_venta, 'PEN','SOLES') moneda
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
  client.query(
    query,
    [documentoCliente, tipoDoc, numero_contrato],
    async (error, resultado) => {
      if (error) {
        const errorResponse = ResponseVO.error(
          "ERR001",
          "Error al obtener los datos del cantrato"
        );
        return res.status(500).json(errorResponse);
      }
      const newUserResponse = ResponseVO.success(resultado.rows, null, null);
      res.set("Content-Type", "application/json; charset=utf-8");
      return res.json(newUserResponse);
    }
  );
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
    pg.fecha_vcto,
    replace(pg.moneda_venta, 'PEN','SOLES') moneda
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
  client.query(
    query,
    [documentoCliente, tipoDoc, numero_contrato],
    async (error, resultado) => {
      if (error) {
        const errorResponse = ResponseVO.error(
          "ERR001",
          "Error al obtener los datos del ultimo pago"
        );
        return res.status(500).json(errorResponse);
      }
      const newUserResponse = ResponseVO.success(resultado.rows, null, null);
      res.set("Content-Type", "application/json; charset=utf-8");
      return res.json(newUserResponse);
    }
  );
};

exports.getObtenerHistorial = async (req, res) => {
  const documentoCliente = req.query.numeroDocumento;
  const tipoDoc = req.query.tipoDocumento;
  const numero_contrato = req.query.numero_contrato;
  const query = `
SELECT distinct
pg.codigo_proyecto,
pg.etiqueta,
pg.nombre,
pg.saldo,
pg.interes_compensatorio,
pg.mora,
TO_CHAR(pg.fecha_vcto, 'DD/MM/YYYY') AS fecha_vcto,
pg.monto_pagado,
TO_CHAR(pg.fecha_pago, 'DD/MM/YYYY') AS fecha_pago,
pg.documento_cliente,
pg.numero_contrato,
pg.monto_programado,
pg.estado,
replace(pg.moneda_venta, 'PEN','SOLES') moneda
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
  client.query(
    query,
    [documentoCliente, tipoDoc, numero_contrato],
    async (error, resultado) => {
      if (error) {
        const errorResponse = ResponseVO.error(
          "ERR001",
          "Error al obtener los datos del ultimo pago"
        );
        return res.status(500).json(errorResponse);
      }
      const newUserResponse = ResponseVO.success(resultado.rows, null, null);
      res.set("Content-Type", "application/json; charset=utf-8");
      return res.json(newUserResponse);
    }
  );
};

// Función principal para obtener números de operación y agregarlos con los comprobantes
exports.getObtenerNumOperaciones = async (req, res) => {
  const numero_contrato = req.query.numero_contrato;
  const nombre_pago = req.query.nombre_pago;

  const query = `
    select ROW_NUMBER() OVER () AS nro, numero_operacion
    from lares.depositos
    where 1=1 and numero_contrato = $1 and nombre_pago = $2;
  `;

  try {
    const resultado = await client.query(query, [numero_contrato, nombre_pago]);
    const operaciones = resultado.rows;

    // Obtener comprobantes para cada número de operación
    const operacionesConComprobantes = await Promise.all(operaciones.map(async (operacion) => {
      console.log(operacion.numero_operacion);
      const comprobantes = await obtenerComprobantes(operacion.numero_operacion);
      // Agregar datos correlativos a los comprobantes
      const comprobantesConDatos = comprobantes.map((comprobante, index) => ({
        nro: index + 1, // Número correlativo
        numero_operacion: operacion.numero_operacion,
        tipoComprobante: comprobante.desc_tdv,
        url: comprobante.pdf_link_fe
      }));

      return comprobantesConDatos.map(comprobante => ({
        ...operacion,
        ...comprobante
      }));
    }));

    // Consolidar todos los resultados en una sola lista
    const listaUnificada = operacionesConComprobantes.flat();

    // Crear una respuesta de éxito con los datos combinados
    const successResponse = ResponseVO.success(listaUnificada, null, null);
    res.set("Content-Type", "application/json; charset=utf-8");
    res.json(successResponse);
  } catch (error) {
    console.error("Error executing query:", error);
    const errorResponse = ResponseVO.error(
      "ERR001",
      "Error al obtener los números de operaciones"
    );
    res.status(500).json(errorResponse);
  }
};

// Función para obtener los comprobantes asociados a un número de operación
async function obtenerComprobantes(numeroOperacion) {
  const url = 'https://apirestlares.digitechso.com/v1/awpp/portalpropietario/representacionimpresacomprobante';
  const params = {
    ListNumOp: [
      {
        num_operacion: numeroOperacion
      }
    ]
  };

  try {
    const response = await axios.post(url, params, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data.Body.jsonRI || []; // Retornar la lista de comprobantes
  } catch (error) {
    console.error("Error fetching data from API:", error);
    return []; // En caso de error, retornar una lista vacía
  }
}