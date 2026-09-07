/// <reference path="../pb_data/types.d.ts" />
// Carga inicial de choferes activos, exportados de la base del otro
// sistema (choferes.csv) — se filtraron los que tenían Inactivo=1
// (o InactivoFecha distinta de "0001-01-01", que es el valor sentinela
// de "nunca dado de baja"). Se incluyen también los marcados como
// EsExterno=1 (empresas de flete tercerizadas) a pedido explícito.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("choferes");

  const choferes = [
  { nombre: "SABBADINI OSCAR RAMON", localidad: "San Francisco" },
  { nombre: "BAZAN MAURICIO DANIEL", localidad: "San Francisco" },
  { nombre: "MONTENEGRO JOSE MARIA", localidad: "San Francisco" },
  { nombre: "PACHECO ELVIO HUGO", localidad: "San Francisco" },
  { nombre: "SALVA FABIAN ALEJANDRO", localidad: "San Francisco" },
  { nombre: "CAROSSIO PABLO SEBASTIAN", localidad: "Córdoba" },
  { nombre: "ROLDAN SERGIO ALEJANDRO", localidad: "San Francisco" },
  { nombre: "VICO ALBERTO DANIEL", localidad: "San Francisco" },
  { nombre: "COZZI RAUL DANIEL", localidad: "San Francisco" },
  { nombre: "FERREYRA MAURICIO CARLOS", localidad: "San Francisco" },
  { nombre: "RICARDINI GUSTAVO OSCAR", localidad: "San Francisco" },
  { nombre: "BOLZICCO ROBERT JAVIER", localidad: "San Francisco" },
  { nombre: "ZAPPAVIGNA VITO", localidad: "San Francisco" },
  { nombre: "LISI GABRIEL DE JESUS", localidad: "Córdoba" },
  { nombre: "TORINO JOSE LUIS", localidad: "San Francisco" },
  { nombre: "PRIOTTI SERGIO OMAR", localidad: "San Francisco" },
  { nombre: "COSTANTINO GERMAN FRANCISCO", localidad: "San Francisco" },
  { nombre: "ABRATE DIEGO ANDRES", localidad: "San Francisco" },
  { nombre: "MANELLI JOSE MARIA", localidad: "San Francisco" },
  { nombre: "FERNANDEZ WALTER JAVIER", localidad: "San Francisco" },
  { nombre: "CAÑETE JUAN CARLOS", localidad: "San Francisco" },
  { nombre: "PICATTI CARLOS ALBERTO", localidad: "San Francisco" },
  { nombre: "LEGUIZAMON GUILLERMO DAMIAN", localidad: "San Francisco" },
  { nombre: "ALBANO NELSON ALEJANDRO", localidad: "Córdoba" },
  { nombre: "FONTANA CARLOS DANIEL", localidad: "San Francisco" },
  { nombre: "ALVAREZ CRISTIAN RAUL", localidad: "Córdoba" },
  { nombre: "GANDOLFO FABIAN RAUL", localidad: "San Francisco" },
  { nombre: "GARNERO ROBERTO CARLOS", localidad: "San Francisco" },
  { nombre: "VILLARROEL MATIAS ADALBERTO", localidad: "San Francisco" },
  { nombre: "ACOSTA EZEQUIEL DARIO", localidad: "San Francisco" },
  { nombre: "FUNES EZEQUIEL DAVID", localidad: "San Francisco" },
  { nombre: "GOMEZ ANDRES HERNAN", localidad: "San Francisco" },
  { nombre: "BROAST CHOFER", localidad: "San Francisco" },
  { nombre: "BRARDA CHOFER", localidad: "San Francisco" },
  { nombre: "BALDI GASTON FRANCISCO", localidad: "San Francisco" },
  { nombre: "AGO PAU", localidad: "San Francisco" },
  { nombre: "ALONSO ALONSO", localidad: "San Francisco" },
  { nombre: "FORZANI MARCOS MIGUEL", localidad: "San Francisco" },
  { nombre: "ROVEDATTI FABIAN OSCAR", localidad: "San Francisco" },
  { nombre: "MOYANO MAURICIO MIGUEL", localidad: "Córdoba" },
  { nombre: "GHIGO CRISTIAN MARIANO", localidad: "San Francisco" },
  { nombre: "FERNANDEZ JOSE ALEJANDRO", localidad: "Córdoba" },
  { nombre: "RUI EMANUEL ALEJANDRO", localidad: "San Francisco" },
  { nombre: "ARUTA KAREN", localidad: "San Francisco" },
  { nombre: "SARAVIA MAXIMILIANO", localidad: "Córdoba" },
  { nombre: "TRANSPORTE TEAR", localidad: "San Francisco" },
  { nombre: "ARIAS JOAQUIN", localidad: "San Francisco" },
  { nombre: "MAGARIO SILVIO", localidad: "San Francisco" },
  { nombre: "ARGAÑARAZ JOAQUIN", localidad: "San Francisco" },
  { nombre: "ALEGRE RUBEN", localidad: "San Francisco" },
  { nombre: "CHIATELLINO SERGIO RUBEN", localidad: "San Francisco" },
  { nombre: "CEBALLES PABLO", localidad: "San Francisco" },
  { nombre: "CHAVEZ MARTIN", localidad: "Córdoba" },
  { nombre: "PRIM FEDERICO DANIEL", localidad: "San Francisco" },
  { nombre: "GROSSO CARLOS ALBERTO", localidad: "San Francisco" },
  { nombre: "TROGOLO RUBEN", localidad: "San Francisco" },
  { nombre: "SABADUCCI WALTER EZEQUIEL", localidad: "San Francisco" },
  { nombre: "CRAVERO DIEGO RAUL", localidad: "San Francisco" },
  { nombre: "MILANESIO VICTOR ORLANDO", localidad: "San Francisco" },
  { nombre: "ANGONOA VALENTIN", localidad: "Córdoba" },
  { nombre: "ACKERMANN JAVIER FERNANDO", localidad: "Córdoba" },
  { nombre: "BELLOTTI EMILIANO ADRIAN", localidad: "San Francisco" },
  { nombre: "MARIN ALEJANDRO AGUSTIN", localidad: "San Francisco" },
  { nombre: "GUGLIELMONE NORBERTO ENRIQUE", localidad: "San Francisco" },
  { nombre: "FREYRE ANDRES", localidad: "San Francisco" },
  { nombre: "LEON AGUSTIN GERARDO", localidad: "San Francisco" },
  { nombre: "CRAVERO EMANUEL JESUS", localidad: "San Francisco" },
  { nombre: "VILLALBA PABLO GERARDO", localidad: "San Francisco" },
  { nombre: "SARTORI NORBERTO GABRIEL", localidad: "San Francisco" },
  { nombre: "GAUNA CRISTIAN LEONEL", localidad: "CABA" },
  { nombre: "GAMBOA EMILIANO", localidad: "San Francisco" },
  { nombre: "NOVERO NAZARENO", localidad: "San Francisco" },
  { nombre: "ZABALA LUIS DANIEL", localidad: "Córdoba" },
  ];

  for (const c of choferes) {
    const record = new Record(collection, {
      nombre: c.nombre,
      localidad: c.localidad,
      activo: true,
    });
    dao.saveRecord(record);
  }

  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("choferes");
  // Solo borra los que agregó esta migración (por nombre exacto), no
  // cualquier chofer que se haya cargado después a mano.
  const nombres = [
    "SABBADINI OSCAR RAMON", "BAZAN MAURICIO DANIEL", "MONTENEGRO JOSE MARIA", "PACHECO ELVIO HUGO",
    "SALVA FABIAN ALEJANDRO", "CAROSSIO PABLO SEBASTIAN", "ROLDAN SERGIO ALEJANDRO", "VICO ALBERTO DANIEL",
    "COZZI RAUL DANIEL", "FERREYRA MAURICIO CARLOS", "RICARDINI GUSTAVO OSCAR", "BOLZICCO ROBERT JAVIER",
    "ZAPPAVIGNA VITO", "LISI GABRIEL DE JESUS", "TORINO JOSE LUIS", "PRIOTTI SERGIO OMAR",
    "COSTANTINO GERMAN FRANCISCO", "ABRATE DIEGO ANDRES", "MANELLI JOSE MARIA", "FERNANDEZ WALTER JAVIER",
    "CAÑETE JUAN CARLOS", "PICATTI CARLOS ALBERTO", "LEGUIZAMON GUILLERMO DAMIAN", "ALBANO NELSON ALEJANDRO",
    "FONTANA CARLOS DANIEL", "ALVAREZ CRISTIAN RAUL", "GANDOLFO FABIAN RAUL", "GARNERO ROBERTO CARLOS",
    "VILLARROEL MATIAS ADALBERTO", "ACOSTA EZEQUIEL DARIO", "FUNES EZEQUIEL DAVID", "GOMEZ ANDRES HERNAN",
    "BROAST CHOFER", "BRARDA CHOFER", "BALDI GASTON FRANCISCO", "AGO PAU", "ALONSO ALONSO",
    "FORZANI MARCOS MIGUEL", "ROVEDATTI FABIAN OSCAR", "MOYANO MAURICIO MIGUEL", "GHIGO CRISTIAN MARIANO",
    "FERNANDEZ JOSE ALEJANDRO", "RUI EMANUEL ALEJANDRO", "ARUTA KAREN", "SARAVIA MAXIMILIANO",
    "TRANSPORTE TEAR", "ARIAS JOAQUIN", "MAGARIO SILVIO", "ARGAÑARAZ JOAQUIN", "ALEGRE RUBEN",
    "CHIATELLINO SERGIO RUBEN", "CEBALLES PABLO", "CHAVEZ MARTIN", "PRIM FEDERICO DANIEL",
    "GROSSO CARLOS ALBERTO", "TROGOLO RUBEN", "SABADUCCI WALTER EZEQUIEL", "CRAVERO DIEGO RAUL",
    "MILANESIO VICTOR ORLANDO", "ANGONOA VALENTIN", "ACKERMANN JAVIER FERNANDO", "BELLOTTI EMILIANO ADRIAN",
    "MARIN ALEJANDRO AGUSTIN", "GUGLIELMONE NORBERTO ENRIQUE", "FREYRE ANDRES", "LEON AGUSTIN GERARDO",
    "CRAVERO EMANUEL JESUS", "VILLALBA PABLO GERARDO", "SARTORI NORBERTO GABRIEL", "GAUNA CRISTIAN LEONEL",
    "GAMBOA EMILIANO", "NOVERO NAZARENO", "ZABALA LUIS DANIEL",
  ];
  for (const nombre of nombres) {
    try {
      const record = dao.findFirstRecordByFilter(collection.id, "nombre = {:nombre}", { nombre });
      dao.deleteRecord(record);
    } catch (e) {
      // no existía (ya borrado a mano, o nunca se creó) — seguimos.
    }
  }

  return null;
})
