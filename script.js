const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwWiYEUWk3RahxMiKTlqoD7xAQX6gpVorulHJgpnXWqS85Ta52rYTRPJNhLImXUIY_Bvw/exec',
  TIMEOUT_CONSULTA: 60000, // 60 segundos
  TIMEOUT_JSONP: 30000,
  SESSION_KEY: 'jaapcb_session_v2',
  CACHE_KEY: 'jaapcb_cache_',
  CACHE_DURATION: 3600000, // 1 hora
  DEBUG: false
};

const ESTADOS_VALIDOS = ['ACTIVO', 'ACTIVA', 'INACTIVO', 'INACTIVA', 'SUSPENDIDO', 'SUSPENDIDA', 'BAJA', 'CANCELADO', 'CANCELADA'];

// =============================================
// UTILIDADES CORE
// =============================================

/**
 * Selector rápido de elementos
 */
const $ = (id) => document.getElementById(id);

/**
 * Formateador de moneda (Lempiras hondureños)
 */
const money = (n) => new Intl.NumberFormat('es-HN', {
  style: 'currency',
  currency: 'HNL',
  minimumFractionDigits: 2
}).format(Number(n) || 0);

/**
 * Logger centralizado
 */
const logger = {
  log: (msg, data = null) => {
    if (CONFIG.DEBUG) {
      console.log(`[JAAPCB] ${msg}`, data || '');
    }
  },
  warn: (msg, data = null) => {
    console.warn(`[JAAPCB ⚠️] ${msg}`, data || '');
  },
  error: (msg, data = null) => {
    console.error(`[JAAPCB ❌] ${msg}`, data || '');
  }
};

/**
 * Validador de identidad
 */
const validateIdentidad = (id) => {
  const clean = String(id || '').replace(/\D/g, '');
  if (clean.length !== 13) {
    return { valid: false, message: 'La identidad debe tener 13 dígitos.' };
  }
  return { valid: true };
};

/**
 * Formateador de identidad (0000-0000-0000)
 */
const formatIdentidad = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 4) return digits;
  if (digits.length <= 8) return digits.slice(0, 4) + '-' + digits.slice(4);
  return digits.slice(0, 4) + '-' + digits.slice(4, 8) + '-' + digits.slice(8);
};

/**
 * Normaliza estado del abonado
 */
const normalizeStatus = (status) => {
  return String(status || 'SIN ESTADO')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

/**
 * Cache manager
 */
const cacheManager = {
  set: (key, data) => {
    try {
      const item = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(CONFIG.CACHE_KEY + key, JSON.stringify(item));
      logger.log(`Cache guardado: ${key}`);
    } catch (e) {
      logger.warn('No se pudo guardar en cache', e);
    }
  },
  
  get: (key) => {
    try {
      const item = localStorage.getItem(CONFIG.CACHE_KEY + key);
      if (!item) return null;
      
      const parsed = JSON.parse(item);
      const age = Date.now() - parsed.timestamp;
      
      if (age > CONFIG.CACHE_DURATION) {
        localStorage.removeItem(CONFIG.CACHE_KEY + key);
        return null;
      }
      
      logger.log(`Cache hit: ${key}`);
      return parsed.data;
    } catch (e) {
      logger.warn('Error leyendo cache', e);
      return null;
    }
  },
  
  clear: () => {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(CONFIG.CACHE_KEY)) {
          localStorage.removeItem(key);
        }
      });
      logger.log('Cache limpiado');
    } catch (e) {
      logger.warn('Error limpiando cache', e);
    }
  }
};

// =============================================
// FUNCIONES DE COMUNICACIÓN
// =============================================

/**
 * JSONP para consultas al backend (evita CORS)
 */
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = 'juntaAgua_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    const script = document.createElement('script');
    let completed = false;

    function cleanup() {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      try {
        delete window[callbackName];
      } catch (e) {
        window[callbackName] = undefined;
      }
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Tiempo de espera agotado (>30s). El servidor no responde.'));
    }, CONFIG.TIMEOUT_JSONP);

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.async = true;
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + encodeURIComponent(callbackName) + '&_=' + Date.now();
    script.onerror = () => {
      cleanup();
      reject(new Error('Error al cargar el script de respuesta.'));
    };

    document.body.appendChild(script);
  });
}

// =============================================
// FUNCIONES DE UI - MENSAJE Y CARGA
// =============================================

/**
 * Mostrar mensaje de error/éxito
 */
function showMessage(text, type = 'error') {
  const msgEl = $('loginMsg');
  if (!msgEl) return;

  msgEl.textContent = text;
  msgEl.className = `msg ${type}`;
  msgEl.setAttribute('role', 'alert');
  
  if (type === 'success') {
    setTimeout(() => msgEl.classList.add('hidden'), 3000);
  }
}

/**
 * Modal de carga con progreso simulado
 */
function showLoadingModal() {
  let modal = $('cargaConsulta');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'cargaConsulta';
  modal.setAttribute('role', 'status');
  modal.setAttribute('aria-live', 'polite');
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(5px);
    box-sizing: border-box;
  `;

  modal.innerHTML = `
    <div style="
      width: min(430px, 100%);
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 20px;
      padding: 28px;
      box-shadow: 0 18px 55px rgba(0, 0, 0, 0.12);
      text-align: center;
      font-family: inherit;
    ">
      <div style="font-size: 2.5rem; margin-bottom: 12px; animation: bounce 2s infinite;">💧</div>
      <div id="cargaTitulo" style="font-size: 1.1rem; font-weight: 700; color: #17202a; margin-bottom: 8px;">
        Cargando su información...
      </div>
      <div id="cargaDetalle" style="font-size: 0.9rem; color: #667085; margin-bottom: 18px; line-height: 1.5;">
        Por favor espere mientras verificamos sus datos, pagos y reuniones.
      </div>
      <div style="height: 8px; background: #edf1f5; border-radius: 99px; overflow: hidden; margin-bottom: 8px;">
        <div id="cargaBarra" style="
          height: 100%;
          width: 12%;
          border-radius: 99px;
          background: linear-gradient(90deg, #087bd1, #20a9ed);
          transition: width 0.45s ease;
        "></div>
      </div>
      <div id="cargaPorcentaje" style="font-size: 0.8rem; color: #667085;">
        Consulta en proceso...
      </div>
    </div>

    <style>
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
    </style>
  `;

  document.body.appendChild(modal);

  // Simular progreso
  const stages = [
    [15, 'Verificando identidad...', 'Buscando datos en el sistema.'],
    [35, 'Consultando pagos...', 'Revisando historial de mensualidades.'],
    [60, 'Verificando reuniones...', 'Consultando asistencia y multas.'],
    [80, 'Cargando información...', 'Consultando comunicados y suministro.'],
    [95, 'Finalizando...', 'Organizando información.']
  ];

  let stageIndex = 0;

  function updateProgress() {
    if (!document.getElementById('cargaConsulta')) return;

    if (stageIndex < stages.length) {
      const [progress, title, detail] = stages[stageIndex++];
      const bar = $('cargaBarra');
      const titleEl = $('cargaTitulo');
      const detailEl = $('cargaDetalle');

      if (bar) bar.style.width = progress + '%';
      if (titleEl) titleEl.textContent = title;
      if (detailEl) detailEl.textContent = detail;

      setTimeout(updateProgress, 500 + Math.random() * 500);
    }
  }

  setTimeout(updateProgress, 350);
}

/**
 * Ocultar modal de carga
 */
function hideLoadingModal() {
  const modal = $('cargaConsulta');
  if (modal) {
    const bar = $('cargaBarra');
    const percent = $('cargaPorcentaje');

    if (bar) bar.style.width = '100%';
    if (percent) percent.textContent = 'Consulta completada ✓';

    setTimeout(() => modal.remove(), 350);
  }
}

// =============================================
// FUNCIONES DE RENDERIZADO
// =============================================

/**
 * Limpiar contenedor
 */
function clearContainer(el) {
  if (!el) return;
  el.innerHTML = '';
}

/**
 * Mostrar estado vacío
 */
function showEmpty(el, text = 'No hay información disponible.') {
  if (!el) return;
  clearContainer(el);
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = text;
  el.appendChild(p);
}

/**
 * Agregar item a lista
 */
function addListItem(container, title, date, text) {
  if (!container) return;

  const item = document.createElement('div');
  item.className = 'item';

  if (title) {
    const t = document.createElement('div');
    t.className = 'item-title';
    t.textContent = title;
    item.appendChild(t);
  }

  if (date) {
    const d = document.createElement('div');
    d.className = 'item-date';
    d.textContent = date;
    item.appendChild(d);
  }

  if (text) {
    const x = document.createElement('div');
    x.className = 'item-text';
    x.textContent = text;
    item.appendChild(x);
  }

  container.appendChild(item);
}

/**
 * Crear tarjeta de alerta de mora
 */
function createMoraAlert(monthsPending) {
  let alert = $('moraAlerta');
  if (alert) alert.remove();

  if (monthsPending < 2) return;

  alert = document.createElement('div');
  alert.id = 'moraAlerta';
  alert.setAttribute('role', 'alert');

  const isHighRisk = monthsPending >= 3;

  alert.style.cssText = `
    margin: 16px 0;
    padding: 16px 18px;
    border-radius: 14px;
    border: 1px solid;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    font-size: 0.82rem;
    line-height: 1.5;
    box-sizing: border-box;
    background: ${isHighRisk ? '#fff1f1' : '#fff8e8'};
    border-color: ${isHighRisk ? '#e05a5a' : '#e3a72f'};
    color: ${isHighRisk ? '#8f1d1d' : '#765000'};
  `;

  const icon = document.createElement('div');
  icon.style.cssText = 'font-size: 1.45rem; line-height: 1; flex: 0 0 auto';
  icon.textContent = isHighRisk ? '🔴' : '⚠️';

  const content = document.createElement('div');

  const title = document.createElement('strong');
  title.style.display = 'block';
  title.style.marginBottom = '3px';
  title.textContent = isHighRisk
    ? '⚠️ RIESGO DE SUSPENSIÓN'
    : '⚠️ MORA PENDIENTE';

  const message = document.createElement('div');
  message.textContent = isHighRisk
    ? `Mantienes ${monthsPending} meses pendientes. Tu servicio corre riesgo de suspensión. Te recomendamos regularizar tu cuenta de inmediato.`
    : `Tienes ${monthsPending} meses de pago pendientes. Acércate a la oficina para evitar cortes del servicio.`;

  content.append(title, message);
  alert.append(icon, content);

  const statusEl = $('status');
  if (statusEl) {
    statusEl.insertAdjacentElement('afterend', alert);
  }
}

/**
 * Renderizar datos principales del abonado
 */
function renderAccountData(data) {
  const abonado = data.abonado || {};
  const cuenta = data.cuenta || {};
  const pending = Number(cuenta.totalAdeudado) || 0;

  // Información del abonado
  $('nombre').textContent = abonado.nombre || 'Abonado';
  $('codigo').textContent = abonado.codigo || '—';
  $('identidadVista').textContent = abonado.identidad || '—';
  $('direccion').textContent = abonado.direccion || '—';

  // Estado del abonado
  const statusEl = $('estadoAbonado');
  const statusNormalized = normalizeStatus(abonado.estado);
  const isActive = statusNormalized === 'ACTIVO' || statusNormalized === 'ACTIVA';
  const isInactive = ['INACTIVO', 'INACTIVA', 'SUSPENDIDO', 'SUSPENDIDA', 'BAJA', 'CANCELADO', 'CANCELADA'].includes(statusNormalized);

  statusEl.classList.remove('status-active', 'status-inactive');
  statusEl.textContent = '● ' + (abonado.estado || 'SIN ESTADO');
  statusEl.classList.add(isActive && !isInactive ? 'status-active' : 'status-inactive');

  // Métricas financieras
  $('pagadoTotal').textContent = money(cuenta.totalPagado);
  $('anioMetric').textContent = 'Este año ' + (cuenta.anio || '');
  $('mensualidadesPagadas').textContent = money(cuenta.totalMensualidadesPagadas);
  $('mesesPagadosTexto').textContent = (Number(cuenta.cantidadPagados) || 0) + ' meses';
  $('moraPagada').textContent = money(cuenta.totalMoraPagada);

  const monthsWithDefault = (cuenta.historial || []).filter(p => Number(p.mora) > 0).length;
  $('mesesMoraTexto').textContent = monthsWithDefault
    ? monthsWithDefault + ' meses con mora'
    : 'Sin mora';

  // Deuda
  $('deuda').textContent = money(pending);
  $('deudaGrande').textContent = money(pending);
  $('pendienteTexto').textContent = pending > 0
    ? (Number(cuenta.cantidadPendientes) || 0) + ' meses pendientes'
    : 'Estás al día';

  // Estado de la cuenta
  const statusContainer = $('status');
  statusContainer.className = 'status' + (pending > 0 ? ' pending' : '');
  $('estado').textContent = pending > 0 ? 'PENDIENTE' : 'AL DÍA';
  $('estadoMensaje').textContent = pending > 0
    ? 'Revisa los meses pendientes y regulariza tu cuenta.'
    : 'Gracias por mantenerte al día con tus pagos.';

  // Alerta de mora
  createMoraAlert(Number(cuenta.cantidadPendientes) || 0);
}

/**
 * Renderizar grilla de pagos mensuales
 */
function renderPaymentGrid(data) {
  const grid = $('monthGrid');
  clearContainer(grid);

  const historial = data.cuenta?.historial || [];

  if (!historial.length) {
    showEmpty(grid, 'Sin información de pagos disponible.');
    return;
  }

  historial.forEach(payment => {
    const card = document.createElement('div');
    const isPaid = payment.estado === 'PAGADO';
    const isLate = isPaid && Number(payment.mora) > 0;

    card.className = isPaid
      ? (isLate ? 'month-card late' : 'month-card paid')
      : (payment.estado === 'PENDIENTE' ? 'month-card pending' : 'month-card future');

    const month = document.createElement('div');
    month.className = 'm-name';
    month.textContent = payment.mes || '';

    const circle = document.createElement('div');
    circle.className = 'circle';
    circle.textContent = isPaid ? '✓' : (payment.estado === 'PENDIENTE' ? '!' : '◷');

    const state = document.createElement('div');
    state.className = 'm-state';

    const amount = document.createElement('div');
    amount.className = 'm-amount';

    if (isPaid) {
      amount.textContent = money(payment.monto);
      state.textContent = isLate ? 'PAGADO CON MORA' : 'PAGADO';
    } else if (payment.estado === 'PENDIENTE') {
      amount.textContent = 'L 65.00';
      state.textContent = 'PENDIENTE';
    } else {
      amount.textContent = '—';
      state.textContent = 'AÚN NO CORRESPONDE';
    }

    card.append(month, circle, state, amount);
    grid.appendChild(card);
  });
}

/**
 * Renderizar historial de pagos
 */
function renderPaymentHistory(data) {
  const container = $('historialLista');
  clearContainer(container);

  const historial = (data.cuenta?.historial || []).filter(p => p.estado === 'PAGADO');

  if (!historial.length) {
    showEmpty(container, 'No hay pagos registrados.');
    return;
  }

  historial.forEach(payment => {
    const isLate = Number(payment.mora) > 0;
    addListItem(
      container,
      payment.mes,
      isLate ? 'Pagado con mora' : 'Pagado',
      money(payment.monto) + (isLate ? ' · Incluye mora' : '')
    );
  });
}

/**
 * Renderizar reuniones y multas
 */
function renderMeetings(data) {
  // Compatibilidad con diferentes formatos de respuesta del backend
  const meetingsData = data.reunionesMultas || data.reunionesYMultas || data.reunionesAsistidas ||
    (data.reuniones && !Array.isArray(data.reuniones) ? data.reuniones : null);

  const publishedMeetings = Array.isArray(data.reuniones) ? data.reuniones : [];

  const totalMeetings = meetingsData ? Number(meetingsData.totalReuniones ?? meetingsData.total) || 0 : null;
  const attendedMeetings = meetingsData ? Number(meetingsData.asistidas ?? meetingsData.reunionesAsistidas) || 0 : null;
  const totalFines = meetingsData ? Number(meetingsData.totalMultas ?? meetingsData.multas) || 0 : null;

  $('reunionesTotal').textContent = meetingsData ? totalMeetings : '—';
  $('reunionesAsistidas').textContent = meetingsData ? attendedMeetings : '—';
  $('reunionesMultas').textContent = meetingsData ? money(totalFines) : '—';

  // Resumen
  const summaryContainer = $('reunionesDetalleResumen');
  clearContainer(summaryContainer);

  if (meetingsData) {
    const absences = Math.max(0, totalMeetings - attendedMeetings);
    [
      ['Reuniones', totalMeetings, ''],
      ['Asistidas', attendedMeetings, 'attended'],
      ['No asistidas', absences, 'absent'],
      ['Multas', money(totalFines), 'fine']
    ].forEach(([label, value, className]) => {
      const div = document.createElement('div');
      div.className = 'meeting-stat ' + className;

      const small = document.createElement('small');
      small.textContent = label;

      const strong = document.createElement('strong');
      strong.textContent = value;

      div.append(small, strong);
      summaryContainer.appendChild(div);
    });
  }

  // Detalle de asistencia
  const detail = meetingsData && (meetingsData.detalle || meetingsData.reuniones || meetingsData.items) || [];
  const detailContainer = $('reunionesAsistenciaLista');
  clearContainer(detailContainer);

  if (!detail.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Aún no hay registros de asistencia disponibles.';
    detailContainer.appendChild(p);
  } else {
    detail.forEach(item => {
      const row = document.createElement('div');
      row.className = 'meeting-row';

      const left = document.createElement('div');

      const date = document.createElement('div');
      date.className = 'meeting-date';
      date.textContent = item.fecha || item.date || item.fechaReunion || 'Fecha no disponible';

      const attended = item.asistio === true ||
        String(item.asistio ?? item.asistencia ?? item.asistioReunion ?? item.presente || '').trim().toUpperCase() === 'TRUE' ||
        String(item.asistio ?? item.asistencia ?? item.asistioReunion ?? item.presente || '').trim().toUpperCase() === 'VERDADERO';

      const status = document.createElement('div');
      status.className = 'meeting-status ' + (attended ? 'yes' : 'no');
      status.textContent = attended ? '✓ ASISTIÓ' : '✕ NO ASISTIÓ';

      left.append(date, status);

      const fine = document.createElement('div');
      fine.className = 'meeting-fine';
      fine.textContent = attended ? 'Sin multa' : money(Number(item.multa ?? item.montoMulta ?? 200) || 200);

      row.append(left, fine);
      detailContainer.appendChild(row);
    });
  }

  // Reuniones publicadas
  const publishedContainer = $('reunionesLista');
  clearContainer(publishedContainer);

  if (!publishedMeetings.length) {
    showEmpty(publishedContainer, 'No hay reuniones programadas.');
  } else {
    publishedMeetings.forEach(meeting => {
      addListItem(
        publishedContainer,
        meeting.descripcion || 'Reunión de abonados',
        meeting.fecha,
        (meeting.lugar || '') + ' · ' + (meeting.hora || '')
      );
    });
  }
}

/**
 * Renderizar listas genéricas
 */
function renderGenericList(elementId, items, formatter, emptyText) {
  const container = $(elementId);
  if (!container) return;

  clearContainer(container);

  if (!items || !items.length) {
    showEmpty(container, emptyText);
    return;
  }

  items.forEach(item => {
    const { title, date, text } = formatter(item);
    addListItem(container, title, date, text);
  });
}

/**
 * Renderizar pantalla principal con todos los datos
 */
function render(data) {
  try {
    // Validar datos
    if (!data || !data.ok || !data.abonado || !data.cuenta) {
      throw new Error('Datos incompletos recibidos del servidor');
    }

    logger.log('Iniciando renderizado de datos', data);

    // Render de datos principales
    renderAccountData(data);
    renderPaymentGrid(data);
    renderPaymentHistory(data);
    renderMeetings(data);

    // Listas genéricas
    renderGenericList(
      'comunicadosLista',
      data.comunicados,
      item => ({
        title: item.titulo,
        date: item.fecha,
        text: item.mensaje
      }),
      'No hay comunicados publicados.'
    );

    renderGenericList(
      'suministroLista',
      data.suministro,
      item => ({
        title: item.sector,
        date: item.fecha,
        text: (item.horaInicio || '') + ' - ' + (item.horaFin || '') + (item.observacion ? ' · ' + item.observacion : '')
      }),
      'No hay horarios publicados.'
    );

    renderGenericList(
      'cortesLista',
      data.cortes,
      item => ({
        title: item.sector,
        date: item.fecha,
        text: (item.horaInicio || '') + ' - ' + (item.horaFin || '') + (item.motivo ? ' · ' + item.motivo : '')
      }),
      'No hay cortes programados.'
    );

    renderGenericList(
      'consejosLista',
      data.consejos,
      item => ({
        title: item.titulo,
        date: item.fecha,
        text: item.consejo
      }),
      'No hay consejos publicados.'
    );

    // Mostrar panel de usuario
    $('login').classList.add('hidden');
    $('panel').classList.remove('hidden');
    $('salir').classList.remove('hidden');
    $('menuBtn').classList.remove('hidden');
    $('sidebar').classList.add('opened');

    // Navegar a inicio
    navigateTo('inicio');

    // Guardar en cache
    cacheManager.set(data.abonado.identidad, data);

    // Scroll suave al topbar
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      topbar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    logger.log('Renderizado completado exitosamente');
  } catch (error) {
    logger.error('Error en renderizado', error);
    showMessage('Ocurrió un error al procesar la información. Por favor, intente nuevamente.', 'error');
  }
}

// =============================================
// FUNCIONES DE NAVEGACIÓN
// =============================================

/**
 * Navegar entre pantallas
 */
function navigateTo(target) {
  // Redirigir 'pagos' a 'inicio'
  const realTarget = target === 'pagos' ? 'inicio' : target;

  // Desactivar todas las pantallas
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  // Activar pantalla destino
  const targetElement = $(realTarget);
  if (targetElement) {
    targetElement.classList.add('active');
  }

  // Actualizar botones de navegación
  document.querySelectorAll('.nav button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === target);
  });

  // Cerrar menú móvil
  closeMenu();

  // Scroll al inicio
  window.scrollTo({ top: 0, behavior: 'smooth' });

  logger.log(`Navegado a: ${realTarget}`);
}

/**
 * Cerrar sesión
 */
function logout() {
  $('panel').classList.add('hidden');
  $('login').classList.remove('hidden');
  $('salir').classList.add('hidden');
  $('menuBtn').classList.add('hidden');
  $('sidebar').classList.remove('opened', 'open');
  $('menuBackdrop').classList.remove('show');

  $('consultar').disabled = false;
  $('consultar').textContent = 'Consultar mi cuenta';
  $('loginMsg').className = 'msg hidden';

  hideLoadingModal();

  $('identidad').value = '';
  $('identidad').focus();

  window.scrollTo({ top: 0, behavior: 'smooth' });

  logger.log('Sesión cerrada');
}

// =============================================
// FUNCIONES DE CONSULTA
// =============================================

/**
 * Consultar datos del abonado
 */
async function consultar() {
  const identidadInput = $('identidad').value.trim();
  const identidad = formatIdentidad(identidadInput);

  $('identidad').value = identidad;

  // Validar
  const validation = validateIdentidad(identidad);
  if (!validation.valid) {
    showMessage(validation.message, 'error');
    return;
  }

  // Verificar cache primero
  const cached = cacheManager.get(identidad);
  if (cached) {
    logger.log('Usando datos en cache');
    render(cached);
    hideLoadingModal();
    return;
  }

  // Desactivar botón
  $('loginMsg').className = 'msg hidden';
  $('consultar').disabled = true;
  $('consultar').textContent = 'Consultando…';

  showLoadingModal();

  try {
    logger.log('Iniciando consulta para identidad: ' + identidad);

    const data = await jsonp(CONFIG.API_URL + '?identidad=' + encodeURIComponent(identidad));

    if (!data || !data.ok) {
      hideLoadingModal();
      const errorMsg = data?.mensaje || 'No encontramos registros con esa identidad. Verifique el número e intente nuevamente.';
      showMessage(errorMsg, 'error');
      $('consultar').disabled = false;
      $('consultar').textContent = 'Consultar mi cuenta';
      logger.warn('Consulta fallida:', data);
      return;
    }

    render(data);
    hideLoadingModal();
    logger.log('Consulta exitosa');
  } catch (error) {
    hideLoadingModal();
    showMessage('Error de conexión. Si el problema persiste, intente más tarde.', 'error');
    logger.error('Error en consulta', error);
    $('consultar').disabled = false;
    $('consultar').textContent = 'Consultar mi cuenta';
  }
}

// =============================================
// FUNCIONES DE MENÚ MÓVIL
// =============================================

/**
 * Toggle menú lateral
 */
function toggleMenu() {
  const sidebar = $('sidebar');
  const backdrop = $('menuBackdrop');
  const isMobile = window.innerWidth <= 720;

  if (isMobile) {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('show');
  } else {
    sidebar.classList.toggle('opened');
  }

  logger.log('Menú toggled');
}

/**
 * Cerrar menú
 */
function closeMenu() {
  $('sidebar').classList.remove('open');
  $('menuBackdrop').classList.remove('show');
}

// =============================================
// EVENT LISTENERS
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  logger.log('Portal JAAPCB inicializado');

  // Consulta
  $('consultar').addEventListener('click', consultar);
  $('identidad').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') consultar();
  });

  // Logout
  $('salir').addEventListener('click', logout);

  // Menú
  $('menuBtn').addEventListener('click', toggleMenu);
  $('menuBackdrop').addEventListener('click', closeMenu);

  // Formateo de identidad en tiempo real
  $('identidad').addEventListener('input', (e) => {
    e.target.value = formatIdentidad(e.target.value);
  });

  // Navegación
  document.querySelectorAll('[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.target);
    });
  });

  // Cerrar menú al hacer click en el contenido (mobile)
  document.querySelector('.main')?.addEventListener('click', () => {
    closeMenu();
  });

  logger.log('Event listeners configurados');
});

// =============================================
// EXPORTACIÓN (Futuro)
// =============================================

/**
 * Exportar datos como PDF (preparado para futura integración)
 */
window.exportPDF = function() {
  logger.log('Función de PDF preparada para integración');
  showMessage('La exportación PDF estará disponible en breve.', 'success');
};

/**
 * Imprimir pantalla actual
 */
window.printAccount = function() {
  window.print();
  logger.log('Impresión iniciada');
};
