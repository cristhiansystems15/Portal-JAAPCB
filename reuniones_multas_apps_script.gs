// ============================================================
// JUNTA DE AGUA CAYO BLANCO
// REUNIONES Y MULTAS — integración con el portal del abonado
// ============================================================
//
// Esta función lee la hoja "REUNIONES Y MULTAS".
// Estructura esperada:
//   Fila 1: IDENTIDAD | NOMBRE | FECHAS...
//   Fila 2:            |        | 09/01/2026 | 09/03/2026 | ...
//   Filas 3+: identidad, nombre y casillas de asistencia.
//
// Casilla marcada   = asistió = L0 de multa
// Casilla sin marcar = no asistió = L200 de multa
//
// La fecha se toma tal como aparece en la hoja. Si existe una fecha
// escrita incorrectamente (por ejemplo 09/81/2028), NO se modifica aquí.
// ============================================================

function obtenerReunionesYMultas_(identidad) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName('REUNIONES Y MULTAS');

  if (!hoja) {
    return {
      totalReuniones: 0,
      asistidas: 0,
      inasistencias: 0,
      totalMultas: 0,
      detalle: []
    };
  }

  var rango = hoja.getDataRange();
  var valores = rango.getValues();
  var visibles = rango.getDisplayValues();

  if (valores.length < 3 || valores[0].length < 3) {
    return {
      totalReuniones: 0,
      asistidas: 0,
      inasistencias: 0,
      totalMultas: 0,
      detalle: []
    };
  }

  var identidadBuscada = normalizarIdentidadReuniones_(identidad);
  var filaCabecera = visibles[0];
  var colIdentidad = -1;

  for (var c = 0; c < filaCabecera.length; c++) {
    if (normalizarTextoReuniones_(filaCabecera[c]) === 'IDENTIDAD') {
      colIdentidad = c;
      break;
    }
  }

  if (colIdentidad < 0) colIdentidad = 0;

  // Las fechas están en la fila 2 (índice 1), comenzando normalmente en C.
  var columnasReunion = [];
  for (var col = 0; col < visibles[1].length; col++) {
    var fechaTexto = String(visibles[1][col] || '').trim();
    if (col >= 2 && fechaTexto) {
      columnasReunion.push({
        columna: col,
        fecha: fechaTexto
      });
    }
  }

  var detalle = [];
  var total = 0;
  var asistidas = 0;
  var multas = 0;

  for (var r = 2; r < valores.length; r++) {
    var identidadFila = normalizarIdentidadReuniones_(visibles[r][colIdentidad] || valores[r][colIdentidad]);
    if (!identidadFila || identidadFila !== identidadBuscada) continue;

    for (var i = 0; i < columnasReunion.length; i++) {
      var reunion = columnasReunion[i];
      var valor = valores[r][reunion.columna];
      var visible = String(visibles[r][reunion.columna] || '').trim().toUpperCase();
      var asistio = esCasillaMarcadaReuniones_(valor, visible);
      var multa = asistio ? 0 : 100;

      total++;
      if (asistio) asistidas++;
      multas += multa;

      detalle.push({
        fecha: reunion.fecha,
        asistio: asistio,
        multa: multa
      });
    }

    // IDENTIDAD debe identificar a un solo abonado.
    break;
  }

  return {
    totalReuniones: total,
    asistidas: asistidas,
    inasistencias: total - asistidas,
    totalMultas: multas,
    detalle: detalle
  };
}

function normalizarIdentidadReuniones_(valor) {
  return String(valor == null ? '' : valor).replace(/\D/g, '');
}

function normalizarTextoReuniones_(valor) {
  return String(valor == null ? '' : valor)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function esCasillaMarcadaReuniones_(valor, visible) {
  if (valor === true) return true;
  if (typeof valor === 'string') {
    var texto = normalizarTextoReuniones_(valor);
    if (texto === 'TRUE' || texto === 'VERDADERO' || texto === 'SI' || texto === 'S') return true;
  }
  if (visible === 'TRUE' || visible === 'VERDADERO' || visible === 'SI' || visible === 'S') return true;
  return false;
}
