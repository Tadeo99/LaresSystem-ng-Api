// const clienteModel = require('../model/clienteModel.js');
const { client, mysqlSequelize } = require("../src/database/connection.js");
const bcrypt = require("bcryptjs");
const ResponseVO = require("../model/ResponseVO.js");
const makeApiRequest = require("../repository/googleDrive.js");
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
with
pagos as
(
select distinct numero_contrato, tipo_cronograma ,etiqueta, estado from lares.pagos 
where tipo_cronograma <> 'cronograma de ahorros' and motivo_inactivo is null and numero_contrato is not null and numero_contrato <> ''
),
contratos as
(
select distinct numero_contrato, tipo_cronograma from pagos
),
estados as
(
   select distinct
       p.numero_contrato
       , p.estado
       , LOWER(p.etiqueta) as etiqueta
       , case when LOWER(p.etiqueta) ='separación' then 1
       		when LOWER(p.etiqueta) ='cuota inicial' then 2
       		when LOWER(p.etiqueta) ='firma de contrato' then 3 
       	end as flag_orden
   FROM 
       pagos p
   WHERE LOWER(p.etiqueta) in ('separación', 'cuota inicial', 'firma de contrato')
),
resultado1 as
(
select 
*
, case when flag_separacion ='pagado' and flag_cuotaincial ='pagado' and flag_firmacontrato ='pagado' then 1
	when flag_separacion ='pagado' and flag_cuotaincial ='pagado' and flag_firmacontrato is null then 1
	when flag_separacion ='pagado' and flag_cuotaincial is null and flag_firmacontrato is null then 1
	when flag_separacion is null and flag_cuotaincial ='pagado' and flag_firmacontrato ='pagado' then 1
	when flag_separacion is null and flag_cuotaincial ='pagado' and flag_firmacontrato is null then 1
	when flag_separacion is null and flag_cuotaincial is null and flag_firmacontrato ='pagado' then 1
	else 0
  end as flag_ok
from (
	select 
	c.numero_contrato
	, c.tipo_cronograma
	, e1.estado as flag_separacion
	, e2.estado as flag_cuotaincial
	, e3.estado as flag_firmacontrato
	from 
		contratos c
		left join estados e1
		on c.numero_contrato = e1.numero_contrato and e1.flag_orden = 1
		left join estados e2
		on c.numero_contrato = e2.numero_contrato and e2.flag_orden = 2
		left join estados e3
		on c.numero_contrato = e3.numero_contrato and e3.flag_orden = 3
	) tf 
	where numero_contrato=$1
),
pagos2 as 
( select distinct numero_contrato, estado from pagos
),
pagos3 as
( select numero_contrato, count(1) as cant from  pagos2
 group by numero_contrato
),
resultado2 as
(
select numero_contrato, 'pago completo' AS estado, 2 as orden from pagos3 where cant =1 and numero_contrato in (select numero_contrato from pagos2 where estado='pagado')
  and numero_contrato=$1
)
select numero_contrato, 'firma contrato' AS estado, 1 as orden  from resultado1 where flag_ok =1
union all
select * from resultado2
order by numero_contrato, orden;
    `;
  client.query(query, [numero_contrato], async (error, resultado) => {
    if (error) {
      const errorResponse = ResponseVO.error(
        "ERR001",
        "Error al obtener el estado del contrato"
      );
      return res.status(200).json(errorResponse);
    }
    const newUserResponse = ResponseVO.success(resultado.rows, null, null);
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
    TO_CHAR(pg.fecha_vcto, 'DD "de" FMMonth "de" YYYY') AS fecha_vcto,
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
      if (resultado.rows.length === 0) {
        const newUserResponse = ResponseVO.success(resultado.rows, null, null);
        res.set("Content-Type", "application/json; charset=utf-8");
        return res.json(newUserResponse);
      }
      const traducirMes = (fecha) => {
        const meses = {
          January: "enero",
          February: "febrero",
          March: "marzo",
          April: "abril",
          May: "mayo",
          June: "junio",
          July: "julio",
          August: "agosto",
          September: "septiembre",
          October: "octubre",
          November: "noviembre",
          December: "diciembre",
        };
        return fecha.replace(
          /January|February|March|April|May|June|July|August|September|October|November|December/g,
          (match) => meses[match]
        );
      };
      // Modificar las fechas en el resultado
      const rowsConFechasTraducidas = resultado.rows.map((row) => {
        row.fecha_vcto = traducirMes(row.fecha_vcto);
        return row;
      });
      const newUserResponse = ResponseVO.success(rowsConFechasTraducidas, null, null);
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
    TO_CHAR(pg.fecha_vcto, 'DD "de" FMMonth "de" YYYY') AS fecha_vcto,
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
      if (resultado.rows.length === 0) {
        const newUserResponse = ResponseVO.success(resultado.rows, null, null);
        res.set("Content-Type", "application/json; charset=utf-8");
        return res.json(newUserResponse);
      }
      const traducirMes = (fecha) => {
        const meses = {
          January: "enero",
          February: "febrero",
          March: "marzo",
          April: "abril",
          May: "mayo",
          June: "junio",
          July: "julio",
          August: "agosto",
          September: "septiembre",
          October: "octubre",
          November: "noviembre",
          December: "diciembre",
        };
        return fecha.replace(
          /January|February|March|April|May|June|July|August|September|October|November|December/g,
          (match) => meses[match]
        );
      };
      // Modificar las fechas en el resultado
      const rowsConFechasTraducidas = resultado.rows.map((row) => {
        row.fecha_vcto = traducirMes(row.fecha_vcto);
        return row;
      });
      const newUserResponse = ResponseVO.success(rowsConFechasTraducidas, null, null);
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
      const comprobantes = await obtenerComprobantes(operacion.numero_operacion,nombre_pago);
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
async function obtenerComprobantes(numeroOperacion,nombre_pago) {
  const url =
    "https://apirestlares.digitechso.com/v1/awpp/portalpropietario/representacionimpresacomprobante";
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
        "Content-Type": "application/json",
      },
    });
    const comprobantes = response.data.Body.jsonRI || [];
    if (comprobantes.length > 0) {
      return comprobantes; // Si hay datos, retornar la lista de comprobantes
    } else {
      // Si no se encontraron datos, hacer la solicitud a la segunda API
      console.error("numeroOperacion", numeroOperacion);
      const idCarpeta = '1SYOcQIk3usM9WWgVNfzohVUJRx4AmmKA';
      const nombreFile = numeroOperacion+'_'+nombre_pago+'.pdf';
      const url = await makeApiRequest(nombreFile, idCarpeta);
      if (url && !url.includes("Error")) {
        //console.error("url add", url);
        const comprobanteAdaptado = [{
          desc_tdv: "Drive", // Asignar "drive" como tipo de documento
          pdf_link_fe: url, // Usar el string como el link del PDF
        }];
        return comprobanteAdaptado;
      } else {
        return [];
      }
    }
  } catch (error) {
    console.error("Error fetching data from API:", error);
    return []; // En caso de error, retornar una lista vacía
  }
}