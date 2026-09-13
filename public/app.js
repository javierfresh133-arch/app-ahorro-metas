const form = document.getElementById('form-meta');
const resultadoDiv = document.getElementById('resultado');

function formatoMoneda(valor) {
  return valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

// --- Lógica ya existente: calcular el plan con los datos del formulario ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const objetivo = document.getElementById('objetivo').value;
  const montoObjetivo = Number(document.getElementById('montoObjetivo').value);
  const dineroInicial = Number(document.getElementById('dineroInicial').value);
  const ahorroMensual = Number(document.getElementById('ahorroMensual').value);
  const plazoMeses = Number(document.getElementById('plazoMeses').value);

  const res = await fetch('/api/calcular', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ montoObjetivo, dineroInicial, ahorroMensual, plazoMeses })
  });

  if (!res.ok) {
    resultadoDiv.classList.remove('oculto');
    resultadoDiv.innerHTML = '<p>Hubo un error al calcular tu plan. Revisá los datos.</p>';
    return;
  }

  const plan = await res.json();
  mostrarResultado(objetivo, plan);
  pedirAnalisisIa({ objetivo, montoObjetivo, dineroInicial, ahorroMensual, plazoMeses, plan });
});

async function pedirAnalisisIa(datos) {
  const iaDiv = document.createElement('div');
  iaDiv.className = 'mensaje-ia';
  iaDiv.textContent = '✨ Pensando un consejo para vos...';
  resultadoDiv.appendChild(iaDiv);

  try {
    const res = await fetch('/api/analizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });

    const data = await res.json();

    if (!res.ok) {
      iaDiv.textContent = '';
      iaDiv.classList.add('oculto');
      return;
    }

    iaDiv.textContent = `✨ ${data.mensaje}`;
  } catch (error) {
    iaDiv.classList.add('oculto');
  }
}

function mostrarResultado(objetivo, plan) {
  resultadoDiv.classList.remove('oculto');

  const estadoClase = plan.esAlcanzable ? 'alcanzable' : 'no-alcanzable';
  const estadoTexto = plan.esAlcanzable
    ? '✅ ¡Tu meta es alcanzable en el plazo que pusiste!'
    : '⚠️ Con tu ahorro actual, no llegás en ese plazo.';

  let alternativasHtml = '';
  if (!plan.esAlcanzable && plan.alternativas.length) {
    alternativasHtml = `
      <div class="alternativas">
        <strong>Opciones para lograrlo:</strong>
        <ul>
          ${plan.alternativas.map(a => `<li>${a}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  resultadoDiv.innerHTML = `
    <h2>Plan para: ${objetivo}</h2>
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

    ${alternativasHtml}
  `;
}
