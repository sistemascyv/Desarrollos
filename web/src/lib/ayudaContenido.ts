export interface AyudaModulo {
  titulo: string;
  resumen: string;
  pasos: string[];
  tips?: string[];
}

// Contenido de la ayuda contextual ("?" flotante, ver AyudaFlotante.tsx).
// Clave = id de MODULES (types.ts), más "inicio" y "administracion" que no
// son módulos pero también tienen pantalla propia. Escrito para alguien
// que usa esa pantalla por primera vez -- si agregás un módulo nuevo o le
// cambiás el flujo a uno existente, actualizá su entrada acá en el mismo
// cambio.
export const AYUDA_MODULOS: Record<string, AyudaModulo> = {
  inicio: {
    titulo: 'Inicio',
    resumen: 'La pantalla de bienvenida: un acceso directo a todos los módulos que tenés habilitados, agrupados por área.',
    pasos: [
      'Hacé clic en cualquier tarjeta para entrar directo a ese módulo.',
      'Si no ves un módulo que necesitás, pedile a un administrador que te lo habilite en Administración → Usuarios → Módulos.',
    ],
  },
  administracion: {
    titulo: 'Administración',
    resumen: 'Pantalla solo para administradores: acá se gestionan los usuarios que entran al sistema y sus permisos.',
    pasos: [
      '"Usuarios" es donde se crea cada persona que va a entrar al sistema: nombre, contraseña, rol (Administrador u Operador) y sucursal.',
      'El botón "Módulos" de cada usuario abre el detalle de a qué módulos tiene acceso (se tildan uno por uno) — eso solo importa para los usuarios "Operador".',
      'Un usuario "Administrador" ve TODOS los módulos siempre, sin importar lo que tenga tildado en "Módulos".',
    ],
    tips: [
      'Si alguien dice que "no ve" algo que un compañero sí ve, lo primero a revisar es si tiene ese módulo tildado acá (o si en realidad necesita ser Administrador).',
    ],
  },
  fichadas: {
    titulo: 'Fichadas',
    resumen: 'Analiza las marcas del reloj biométrico, calcula horas trabajadas, horas extra y ausencias, y permite cargar fichadas a mano cuando el reloj falla.',
    pasos: [
      'En "Carga y novedades" subís el .txt que exporta el reloj biométrico (el nombre del archivo tiene que incluir el depósito: cordoba, rosario, buenos_aires o san_francisco).',
      'Ahí mismo podés cargar Feriados, y "Asignar novedad" (vacaciones, licencias) a un empleado o a toda un área en un rango de fechas.',
      'En "Resultados" elegís un rango de fechas y "Procesar período" para que el sistema cruce las marcas contra el horario esperado de cada empleado.',
      'En el detalle vas a ver, día por día, las horas normales y extra; si faltó una marca, ese día queda AUSENTE.',
      'Si un día quedó AUSENTE porque el reloj falló, lo podés arreglar ahí mismo: "Cargar horario" (si sabés el horario real que trabajó) o "Asignar novedad" (si fue una licencia/vacaciones, sin horas reales que cargar).',
      'Desde "Formatos para presentar" descargás en Excel el Informe de Entradas y Salidas, Horas Extra Mensual, Parte Diario o Control de Ausentismo.',
    ],
    tips: [
      'El depósito de Córdoba redondea los horarios cada 15 minutos; el resto, cada 30 — es automático.',
      'Si una tarjeta del reloj no tiene ningún legajo asociado, el sistema avisa cuántas marcas quedaron "sin legajo" al importar.',
    ],
  },
  personal: {
    titulo: 'Personal',
    resumen: 'La ficha de cada empleado: alta, baja, reincorporación, horario, categoría de convenio y el básico que cobra.',
    pasos: [
      'En "Empleados" cargás gente nueva con N° Legajo, N° Tarjeta, Nombre, Área, Horario y Fecha de alta.',
      'Para asignarle una categoría de convenio (y con eso, su básico) usás "Asignar categoría" (o "Cambiar categoría" si ya tiene una) en la fila del empleado: elegís la categoría y desde qué fecha rige, y el básico se completa solo con el "Básico sugerido" de esa categoría — ya no se escribe el básico a mano.',
      '"Ver historial" muestra todos los cambios de categoría/básico que tuvo ese empleado a lo largo del tiempo, con la fecha desde la que empezó a regir cada uno.',
      '"Dar de baja" cierra el legajo con fecha y motivo; "Reactivar" lo reabre si vuelve a trabajar (guardando la etapa anterior en su historial).',
      'Las otras pestañas (Horario personalizado, Horas extra fijas, Plantillas de horario, Áreas) sirven para configurar el horario esperado de cada empleado o grupo.',
    ],
    tips: [
      'El básico de un empleado siempre sale de su categoría — para cambiarle el sueldo, cambiale (o actualizale) la categoría, no se puede escribir directo.',
      'Si corregís la fecha de alta de alguien, el sistema mueve solo su primer período de básico para que coincida (salvo que ya tenga un cambio de categoría posterior cargado, ahí avisa y no toca nada).',
    ],
  },
  sueldos: {
    titulo: 'Sueldos',
    resumen: 'Liquida el sueldo mensual de choferes y administrativos, y mantiene las categorías de convenio y las tarifas de viaje que usa esa liquidación.',
    pasos: [
      '"Categorías" es donde se cargan las categorías del convenio (CCT 40/89) con su básico sugerido, plus vacacional, divisor y los 6 porcentajes de descuento. Si cambiás el básico sugerido de una categoría, se propaga solo a todos los empleados que la tengan asignada (pidiendo desde qué fecha rige).',
      '"Tarifas de viaje" son los valores por km, control de carga y descarga, permanencia, viáticos, etc. que usa la liquidación de choferes.',
      '"Liquidación — Choferes" calcula el sueldo de un chofer para un mes: básico + variable (según los tramos cargados en Planilla Choferes) − descuentos.',
      '"Liquidación — Administrativos" calcula el sueldo de un empleado administrativo: básico + horas extra reales del mes + antigüedad + viáticos − descuentos, usando los datos de Fichadas de ese período.',
    ],
    tips: [
      'Administrativos y Choferes son excluyentes: un legajo vinculado a un chofer se liquida en "Choferes", el resto en "Administrativos".',
      'El básico que usa cada liquidación es el que regía EN ESE MES puntual, no el actual — así, si liquidás un mes viejo después de un aumento, se usa el sueldo de ese momento.',
    ],
  },
  vacaciones: {
    titulo: 'Vacaciones',
    resumen: 'Gestiona los períodos de vacaciones de cada empleado y calcula cuánto le corresponde cobrar por ese período.',
    pasos: [
      'Le asignás a un empleado un período de vacaciones (desde/hasta), con un comentario opcional.',
      'El sistema muestra cuántos días le corresponden según su antigüedad, y si hay empleados del mismo grupo/área superpuestos en las mismas fechas (para no dejar un equipo entero sin gente).',
      'Podés marcar un período como "notificado" una vez que le avisaste al empleado.',
      '"Liquidar" un período calcula lo que tiene que cobrar: básico + horas extra promedio de los últimos 6 meses + antigüedad + plus vacacional, partido por mes si el período cruza de uno a otro.',
    ],
    tips: [
      'La liquidación usa el básico que regía al INICIO del período de vacaciones, no el actual.',
      'Si el período cruza de un mes a otro, se calcula por tramos, cada uno con la antigüedad del año que corresponda.',
    ],
  },
  planilla_choferes: {
    titulo: 'Planilla Choferes',
    resumen: 'Reemplaza la planilla de papel que llenaba el chofer: acá se cargan los viajes/tramos de cada chofer con sus km y cargas, y se cruzan contra el satelital.',
    pasos: [
      'Cada tramo de viaje de un chofer se carga con fecha, origen/destino, km recorridos, si hubo control de carga y descarga, permanencia, cruce de frontera, etc.',
      '"Cruce con satelital" compara los km que cargaste contra los que marcó el sistema satelital del camión, para detectar diferencias.',
      '"Filtrar tramos" te deja buscar los tramos de un chofer o período puntual.',
      '"Tarifa y viático por mes" y "Resumen" dan un pantallazo de lo que acumuló un chofer en el mes antes de ir a liquidar.',
    ],
    tips: [
      'Todo lo que se carga acá es justamente lo que después usa Sueldos → Liquidación Choferes para calcular lo que cobra cada chofer ese mes.',
    ],
  },
  control_cheques: {
    titulo: 'Control de Cheques',
    resumen: 'Carga los cheques que recibe la empresa, les lee los datos automáticamente de una foto y consulta su situación en el BCRA.',
    pasos: [
      'Sacale una foto o escaneo al cheque y pegalo (Ctrl+V), arrastralo, o subilo como archivo — el sistema le lee el CUIT y los demás datos solo (lectura automática).',
      'Si el CUIT que leyó es válido, se guarda automáticamente y consulta el BCRA (rechazos, situación crediticia) sin que tengas que hacer nada más.',
      'Si no pudo leer bien el cheque o el CUIT no es válido, deja una fila editable para completar o corregir los datos a mano y guardarla con "Guardar".',
      'Si no tenés la foto a mano, "+ Agregar cheque a mano (sin foto)" te deja cargar todo manualmente.',
      'Haciendo clic en el estado de cada cheque (si tiene rechazados o no) se abre el detalle completo que mandó el BCRA.',
    ],
    tips: [
      'Podés guardar un cheque aunque el CUIT no pase la validación — el sistema avisa y deja confirmar igual.',
      'Si cargás muchos cheques seguidos, el BCRA a veces frena las consultas un rato; el sistema reintenta solo, no hace falta volver a consultar a mano.',
      '"Borrar" y "Limpiar lista" no se pueden deshacer.',
    ],
  },
  central_deudores: {
    titulo: 'Central de Deudores',
    resumen: 'Consulta la situación de deuda y cheques rechazados de un cliente o proveedor contra el BCRA, con solo un CUIT.',
    pasos: [
      'Escribí el CUIT que querés consultar (sin puntos ni guiones) y apretá "Consultar" (o Enter).',
      'Vas a ver: datos generales (persona física o sociedad, deuda actual, peor situación), un gráfico con la evolución de la deuda de los últimos 24 meses, el detalle de deuda por entidad bancaria, los cheques rechazados, y el historial completo mes a mes.',
    ],
    tips: [
      'Si el CUIT no pasa la validación del dígito verificador, el sistema avisa pero deja consultar igual.',
    ],
  },
  vale_caja: {
    titulo: 'Vale de Caja',
    resumen: 'Genera el comprobante de un pago en efectivo a un chofer, listo para imprimir.',
    pasos: [
      'Elegís el chofer (solo aparecen los activos), la fecha, el importe y el concepto.',
      'Al apretar "Guardar", el vale se numera solo y el sistema abre el diálogo de impresión del navegador, con 2 copias: ORIGINAL y DUPLICADO.',
      '"Cargar otro" te deja hacer el próximo vale sin recargar la pantalla.',
      'En el historial podés "Reimprimir" cualquier vale viejo, o "Eliminar" (solo administradores).',
      'Si un vale quedó marcado "Usado" (porque ya se asoció a una rendición) y hace falta corregirlo, "Liberar" lo desvincula para poder reutilizarlo.',
    ],
    tips: ['La numeración es correlativa y automática, no se elige a mano.'],
  },
  recibos: {
    titulo: 'Recibos',
    resumen: 'Genera el comprobante de un cobro que recibe la empresa de un tercero (por ejemplo, la venta de un camión), listo para imprimir.',
    pasos: [
      'El campo "Recibí de" viene precargado con el nombre de la empresa, pero se puede editar; completás fecha, importe, moneda (pesos o dólares) y concepto.',
      '"Guardar" numera el recibo solo y abre el diálogo de impresión del navegador (ORIGINAL + DUPLICADO).',
      '"Cargar otro" para el siguiente; en el historial podés "Reimprimir" o "Eliminar" (solo administradores) cualquier recibo anterior.',
    ],
    tips: ['Mismo mecanismo de numeración automática que Vale de Caja.'],
  },
  consumo_combustible: {
    titulo: 'Consumo de Combustible',
    resumen: 'Calcula el consumo, el ranking de eficiencia por camión y por chofer, y el costo por km de la flota.',
    pasos: [
      'Elegís de dónde salen los datos: los tramos ya cargados en el sistema (rango de fechas + "Buscar") o subir directamente la planilla que exporta "ControlCombustible" (.xls/.xlsx).',
      'Aparecen el Resumen de flota, el Ranking por camión, el Ranking por chofer, el Costo por km y los Repostajes en ruta.',
      'Podés ajustar en vivo el "Precio del gasoil" y el "Tipo de cambio" para que el costo por km se recalcule con esos valores.',
      'Si subiste un archivo, queda guardado en un historial para reabrirlo después sin volver a subirlo.',
    ],
    tips: [
      'Un archivo subido se procesa en tu propia computadora, no se guarda en el servidor.',
      'Solo entran en los cálculos los tramos con km y litros cargados — la pantalla avisa cuántos tramos del rango elegido se pudieron usar.',
    ],
  },
  panel_cubiertas: {
    titulo: 'Panel de Cubiertas',
    resumen: 'Analiza el reporte de cubiertas del sistema viejo para ver vida útil, recapados, costo por km y dónde se puede ahorrar.',
    pasos: [
      'Subís el reporte de cubiertas (.xls/.xlsx) con el dropzone de la pantalla.',
      'El sistema lo procesa en tu computadora y muestra: puntos clave, resumen del parque, vida útil por marca, compras por año, cómo afecta el recapado a la vida útil, proveedores y bandas de recapado, costo por km, detalle por marca y modelo, y una estimación de ahorro anual posible.',
      'Igual que en Consumo de Combustible, los archivos subidos quedan en un historial para reabrirlos sin volver a subirlos.',
    ],
    tips: [
      'Las filas cuyo "Estado" no coincide con ninguno de los 3 que el sistema reconoce (montada/desmontada/baja) quedan afuera de todas las cuentas, marcadas "Sin clasificar".',
      'Las comparaciones por proveedor o marca piden una cantidad mínima de datos para no comparar con muestras muy chicas.',
    ],
  },
  flota_posicion: {
    titulo: 'Posición de Flota',
    resumen: 'Monitoreo satelital de los camiones en vivo, conectado con el sistema externo Pressa.',
    pasos: [
      'Tiene 5 pestañas: Mapa en vivo, Cadena de frío, Eventos, Recorrido histórico y Km real.',
      '"Mapa en vivo", "Cadena de frío" y "Eventos" se actualizan solas cada 1 minuto mientras estás en esa pestaña — no hace falta refrescar la página.',
      '"Recorrido histórico" te deja elegir un vehículo y ver por dónde anduvo.',
      '"Km real" arma un reporte de kilómetros recorridos, independiente de las otras pestañas.',
    ],
    tips: ['La actualización automática solo corre en la pestaña que tenés abierta — al cambiar de pestaña se corta la de antes y arranca la nueva.'],
  },
  reportes: {
    titulo: 'Reportes',
    resumen: 'Estadísticas anuales de RRHH — Horas Extras, Ausentismo y Rotación de personal — para reemplazar las planillas que se armaban a mano.',
    pasos: [
      'Elegís qué querés ver (Horas Extras, Ausentismo o Rotación) y el año.',
      'Para Horas Extras hace falta primero cargar "Horas posibles por mes" (y guardarlas) — es el dato contra el que se compara cuánta hora extra se hizo.',
      'Apretás "Calcular" y aparece la tabla mensual por área (o por causa, en Ausentismo, o el cuadro de altas/bajas en Rotación), con promedios y totales.',
      '"Descargar Excel" exporta las 3 vistas juntas en un mismo archivo, aunque en pantalla solo estés mirando una — por eso hay que haber calculado las 3 al menos una vez antes de poder descargar.',
    ],
    tips: ['En Ausentismo, el sistema avisa hasta qué fecha hay fichadas realmente cargadas — los días posteriores todavía no se cuentan como falta sin justificar, para no mostrar ausencias falsas por datos que no llegaron.'],
  },
  bot_tarifas: {
    titulo: 'Actualizar Tarifas',
    resumen: 'Aplica un aumento porcentual a TODAS las tarifas del sistema de ventas de terceros (clientes, acuerdos especiales, tipo de carga, tarifas generales, todas las sucursales) de una sola vez.',
    pasos: [
      'Cargás el porcentaje de aumento y apretás "Actualizar tarifas".',
      'El sistema prepara un enlace especial y te pide que hagas CLIC VOS MISMO en ese enlace para arrancar el proceso — hace falta porque el aumento lo corre un programa instalado en esa computadora puntual de la oficina.',
      'El navegador va a pedir una confirmación (se ve distinto en Firefox que en Chrome/Edge; la pantalla explica cómo es en cada uno).',
      'El proceso corre solo y puede tardar varios minutos (el paso de Acuerdos Especiales es el que más tarda, hasta 10 minutos) — el resultado aparece en pantalla y queda guardado en el Historial.',
    ],
    tips: [
      'Esto SOLO funciona desde la computadora de oficina que tiene el programa instalado — no se puede correr desde cualquier PC.',
      'Si pasan más de 30 segundos sin que pase nada, la pantalla explica qué revisar.',
    ],
  },
  cuadro_tarifario: {
    titulo: 'Tarifas',
    resumen: 'Muestra los valores de referencia PROPIOS de la empresa (no es el sistema de ventas real) para carga Seca y Refrigerada.',
    pasos: [
      'Elegís la pestaña "Seco" o "Refrigerado" (Frío y Congelado juntas) para ver la tabla de valores.',
      '"Descargar imagen" baja una foto (PNG) del cuadro tal cual se ve en pantalla, para mandar por WhatsApp o imprimir.',
      'Si sos administrador, podés aplicar un ajuste porcentual a TODOS los valores de las 3 categorías (y los mínimos por sucursal) de una sola vez, con "% de actualización" + "Aplicar".',
    ],
    tips: [
      'Esto es solo de referencia interna — no modifica el sistema de ventas real de terceros, eso se hace en "Actualizar Tarifas".',
      'El ajuste porcentual admite hasta 50% y pide confirmación antes de aplicarse, porque después no se puede deshacer solo.',
    ],
  },
  cotizador: {
    titulo: 'Cotizador',
    resumen: 'Arma presupuestos de flete para clientes, calculando el precio solo según los datos que cargues, listos para imprimir.',
    pasos: [
      'Desde la lista de cotizaciones, "+ Nueva Cotización" abre el formulario.',
      'Completás los datos generales: fecha, tráfico origen/destino, quién paga, categoría de carga (Seco, Frío o Congelado), cliente (uno ya cargado, o tildás "Cliente nuevo" y escribís el nombre), datos de contacto y lugares de carga/descarga.',
      'Agregás uno o más ítems con kilos, bultos y valor declarado (si es carga Seca, también metros cúbicos) — el precio y el total de cada ítem se calculan solos.',
      'Si corresponde, tildás "Seguro" y ajustás el porcentaje; el total general se actualiza abajo de todo.',
      'Desde la lista podés "Imprimir" cualquier cotización ya guardada.',
    ],
    tips: ['La columna de metros cúbicos solo aparece si elegís categoría "Seco" — si cambiás a Frío o Congelado, los m³ que hayas cargado se borran.'],
  },
};
