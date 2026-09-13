const listaMetasDiv = document.getElementById('lista-metas');
const btnNuevaMeta = document.getElementById('btn-nueva-meta');
const form = document.getElementById('form-meta');
const btnCancelar = document.getElementById('btn-cancelar');
const btnSimular = document.getElementById('btn-simular');
const btnGuardarMeta = document.getElementById('btn-guardar-meta');
const resultadoSimulacionDiv = document.getElementById('resultado-simulacion');
const mensajeIaSimulacionDiv = document.getElementById('mensaje-ia-simulacion');

function formatoMoneda(valor) {
  return valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

// --- Mostrar / ocultar el formulario de nueva meta ---
btnNuevaMeta.addEventListener('click', () => {
  form.classList.remove('oculto');
  btnNuevaMeta.classList.add('oculto');
});

btnCancelar.addEventListener('click', () => {
  resetearFormulario();
});

function resetearFormulario() {
  form.reset();
  form.classList.add('oculto');
  btnNuevaMeta.classList.remove('oculto');
  resultadoSimulacionDiv.classList.add('oculto');
  resultadoSimulacionDiv.innerHTML = '';
  btnGuardarMeta.classList.add('oculto');
  mensajeIaSimulacionDiv.classList.add('oculto');
  mensajeIaSimulacionDiv.textContent = '';
}

function leerDatosFormulario() {
  return {
    nombre: document.getElementById('nombre').value,
    montoObjetivo: Number(document.getElementById('montoObjetivo').value),
    dineroInicial: Number(document.getElementById('dineroInicial').value),
    ahorroMensual: Number(document.getElementById('ahorroMensual').value),
    plazoMeses: Number(document.getElementById('plazoMeses').value)
  };
}

// --- Simular: calcula y muestra el resultado, sin guardar nada ---
btnSimular.addEventListener('click', async () => {
  const datos = leerDatosFormulario();

  if (!datos.nombre || !datos.montoObjetivo || !datos.plazoMeses) {
    alert('Completá al menos el nombre, el monto objetivo y el plazo.');
    return;
  }

  const res = await fetch('/api/calcular', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos)
  });

  if (!res.ok) {
    alert('Hubo un error al simular. Revisá los datos.');
    return;
  }

  const plan = await res.json();
  mostrarResultadoSimulacion(plan);
  btnGuardarMeta.classList.remove('oculto');

  mensajeIaSimulacionDiv.classList.remove('oculto');
  mensajeIaSimulacionDiv.textContent = '✨ Pensando un consejo para vos...';

  try {
    const resIa = await fetch('/api/analizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objetivo: datos.nombre,
        montoObjetivo: datos.montoObjetivo,
        dineroInicial: datos.dineroInicial,
        ahorroMensual: datos.ahorroMensual,
        plazoMeses: datos.plazoMeses,
        plan
      })
    });

    const dataIa = await resIa.json();

    if (resIa.ok) {
      mensajeIaSimulacionDiv.textContent = `✨ ${dataIa.mensaje}`;
    } else {
      mensajeIaSimulacionDiv.classList.add('oculto');
    }
  } catch (error) {
    mensajeIaSimulacionDiv.classList.add('oculto');
  }
});

function mostrarResultadoSimulacion(plan) {
  resultadoSimulacionDiv.classList.remove('oculto');

  const estadoClase = plan.esAlcanzable ? 'alcanzable' : 'no-alcanzable';
  const estadoTexto = plan.esAlcanzable
    ? '✅ ¡Es alcanzable en el plazo que pusiste!'
    : '⚠️ Con ese ahorro, no llegás en ese plazo.';

  resultadoSimulacionDiv.innerHTML = `
    <div class="estado ${estadoClase}">${estadoTexto}</div>
    <div class="barra-progreso">
      <div class="barra-progreso-interna" style="width:${plan.porcentajeProgreso}%"></div>
    </div>
    <div class="fila"><span>Progreso</span><strong>${plan.porcentajeProgreso}%</strong></div>
    <div class="fila"><span>Te falta ahorrar</span><strong>${formatoMoneda(plan.restante)}</strong></div>
    <div class="fila"><span>Por mes</span><strong>${formatoMoneda(plan.ahorroPorMesNecesario)}</strong></div>
    <div class="fila"><span>Por semana</span><strong>${formatoMoneda(plan.ahorroPorSemanaNecesario)}</strong></div>
    <div class="fila"><span>Por día</span><strong>${formatoMoneda(plan.ahorroPorDiaNecesario)}</strong></div>
    ${plan.mesesEstimados !== null ? `<div class="fila"><span>Tiempo estimado real</span><strong>${plan.mesesEstimados} meses</strong></div>` : ''}
  `;
}

// --- Guardar meta: recién acá se persiste en la base de datos ---
btnGuardarMeta.addEventListener('click', async () => {
  const datos = leerDatosFormulario();

  const res = await fetch('/api/metas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos)
  });

  if (!res.ok) {
    alert('Hubo un error al guardar la meta.');
    return;
  }

  resetearFormulario();
  cargarMetas();
});

// --- Cargar y mostrar todas las metas ---
async function cargarMetas() {
  listaMetasDiv.innerHTML = '<p class="cargando">Cargando tus metas...</p>';

  const res = await fetch('/api/metas');

  if (!res.ok) {
    listaMetasDiv.innerHTML = '<p class="cargando">No se pudieron cargar tus metas.</p>';
    return;
  }

  const metas = await res.json();

  if (metas.length === 0) {
    listaMetasDiv.innerHTML = '<p class="cargando">Todavía no tenés metas. ¡Creá la primera!</p>';
    return;
  }

  listaMetasDiv.innerHTML = '';
  metas.forEach((meta) => listaMetasDiv.appendChild(crearTarjetaMeta(meta)));
}

function crearTarjetaMeta(meta) {
  const div = document.createElement('div');
  div.className = 'tarjeta-meta';

  const estadoClase = meta.plan.esAlcanzable ? 'alcanzable' : 'no-alcanzable';
  const estadoTexto = meta.plan.esAlcanzable
    ? '✅ Alcanzable en el plazo'
    : '⚠️ No llegás en el plazo actual';

  div.innerHTML = `
    <div class="tarjeta-header">
      <h2>${meta.nombre}</h2>
      <button class="btn-borrar" title="Borrar meta">✕</button>
    </div>

    <div class="estado ${estadoClase}">${estadoTexto}</div>

    <div class="barra-progreso">
      <div class="barra-progreso-interna" style="width:${meta.plan.porcentajeProgreso}%"></div>
    </div>
    <div class="fila"><span>Progreso</span><strong>${meta.plan.porcentajeProgreso}%</strong></div>
    <div class="fila"><span>Ahorrado</span><strong>${formatoMoneda(meta.totalAhorrado)}</strong></div>
    <div class="fila"><span>Te falta</span><strong>${formatoMoneda(meta.plan.restante)}</strong></div>
    <div class="fila"><span>Objetivo</span><strong>${formatoMoneda(meta.montoObjetivo)}</strong></div>

    <div class="agregar-deposito">
      <input type="number" min="1" step="1" placeholder="Monto ahorrado" class="input-deposito">
      <button class="btn-deposito">Agregar</button>
    </div>

    <div class="mensaje-ia">✨ Pensando un consejo para vos...</div>
  `;

  pedirAnalisisIa(meta, div.querySelector('.mensaje-ia'));

  div.querySelector('.btn-deposito').addEventListener('click', async () => {
    const input = div.querySelector('.input-deposito');
    const monto = Number(input.value);

    if (!monto || monto <= 0) {
      alert('Escribí un monto válido.');
      return;
    }

    const res = await fetch(`/api/metas/${meta.id}/depositos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monto })
    });

    if (!res.ok) {
      alert('No se pudo guardar el depósito.');
      return;
    }

    cargarMetas();
  });

  div.querySelector('.btn-borrar').addEventListener('click', async () => {
    const confirmar = confirm(`¿Borrar la meta "${meta.nombre}"? Esta acción no se puede deshacer.`);
    if (!confirmar) return;

    const res = await fetch(`/api/metas/${meta.id}`, { method: 'DELETE' });

    if (!res.ok) {
      alert('No se pudo borrar la meta.');
      return;
    }

    cargarMetas();
  });

  return div;
}

async function pedirAnalisisIa(meta, iaDiv) {
  try {
    const res = await fetch('/api/analizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objetivo: meta.nombre,
        montoObjetivo: meta.montoObjetivo,
        dineroInicial: meta.totalAhorrado,
        ahorroMensual: meta.ahorroMensual,
        plazoMeses: meta.plazoMeses,
        plan: meta.plan
      })
    });

    const data = await res.json();

    if (!res.ok) {
      iaDiv.classList.add('oculto');
      return;
    }

    iaDiv.textContent = `✨ ${data.mensaje}`;
  } catch (error) {
    iaDiv.classList.add('oculto');
  }
}

cargarMetas();
