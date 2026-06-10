(async () => {
  const meRes = await fetch('/api/auth/me', { credentials: 'include' });
  if (!meRes.ok) return (location.href = '/login.html');

  let cart = Cart.get();
  if (!cart.length) return (location.href = '/index.html');

  const summaryItems = document.getElementById('summaryItems');
  const summaryTotal = document.getElementById('summaryTotal');
  const payBtn = document.getElementById('payBtn');
  const payBtnText = document.getElementById('payBtnText');

  function refreshCart() {
    cart = Cart.get();
    if (!cart.length) return (location.href = '/index.html');
    renderSummary();
  }

  function renderSummary() {
    summaryItems.innerHTML = '';

    cart.forEach(item => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      row.innerHTML = `
        <div class="summary-item-main">
          <span class="summary-item-name">${item.name}</span>
          <div class="summary-item-tags">
            ${item.size ? `<span class="summary-size-tag">Size: ${item.size}</span>` : ''}
            ${item.color ? `<span class="summary-color-tag">Color: ${item.color}</span>` : ''}
            <span class="qty-tag">x${item.quantity}</span>
          </div>
          <button type="button" class="summary-remove-btn">Remove</button>
        </div>
        <span class="summary-price">KES ${Math.ceil(item.price * item.quantity * 130).toLocaleString()}</span>
      `;
      row.querySelector('.summary-remove-btn').addEventListener('click', () => {
        Cart.remove(item.id, item.size || null, item.color || null);
        refreshCart();
      });
      summaryItems.appendChild(row);
    });

    summaryTotal.textContent = `KES ${Math.ceil(Cart.total() * 130).toLocaleString()}`;
    payBtn.disabled = Cart.count() === 0;
  }

  renderSummary();

  let orderId = null;
  let pollInterval = null;
  let timerInterval = null;

  function showError(msg) {
    const el = document.getElementById('payError');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function hideError() {
    document.getElementById('payError').classList.add('hidden');
  }

  function setPayBtn(loading) {
    payBtn.disabled = loading;
    payBtnText.textContent = loading ? 'Sending prompt...' : 'Pay with M-Pesa';
  }

  function hidePending() {
    document.getElementById('stkPending').classList.add('hidden');
    payBtn.classList.remove('hidden');
    clearInterval(timerInterval);
  }

  function stopPolling() {
    clearInterval(pollInterval);
    clearInterval(timerInterval);
    hidePending();
    setPayBtn(false);
  }

  function showSuccess() {
    hidePending();
    document.getElementById('paySuccess').classList.remove('hidden');
    payBtn.classList.add('hidden');
    Cart.clear();
  }

  function showPending() {
    document.getElementById('stkPending').classList.remove('hidden');
    payBtn.classList.add('hidden');
    let secs = 60;
    document.getElementById('timerCount').textContent = secs;
    timerInterval = setInterval(() => {
      secs--;
      document.getElementById('timerCount').textContent = secs;
      if (secs <= 0) stopPolling();
    }, 1000);
  }

  function startPolling() {
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/status/${orderId}`, { credentials: 'include' });
        const data = await res.json();
        if (data.status === 'paid') {
          clearInterval(pollInterval);
          clearInterval(timerInterval);
          showSuccess();
        } else if (data.status === 'cancelled') {
          stopPolling();
          showError('Payment was cancelled. Please try again.');
        }
      } catch {}
    }, 3000);
  }

  document.getElementById('cancelWait').addEventListener('click', () => {
    stopPolling();
    showError('Payment cancelled. You can try again.');
  });

  payBtn.addEventListener('click', async () => {
    hideError();
    cart = Cart.get();
    if (!cart.length) return (location.href = '/index.html');

    const rawPhone = document.getElementById('mpesaPhone').value.trim();
    const shipping = document.getElementById('shippingAddress').value.trim();

    if (!rawPhone) return showError('Please enter your M-Pesa phone number.');
    if (rawPhone.replace(/\D/g, '').length < 9) return showError('Please enter a valid phone number.');

    setPayBtn(true);

    try {
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          items: cart.map(i => ({
            product_id: i.id,
            quantity: i.quantity,
            size: i.size || null,
            color: i.color || null,
          })),
          shipping_address: shipping,
        }),
      }).then(r => r.json());

      if (orderRes.error) {
        setPayBtn(false);
        return showError(orderRes.error);
      }
      orderId = orderRes.order.id;

      const stkRes = await fetch('/api/payments/stk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ order_id: orderId, phone: rawPhone }),
      }).then(r => r.json());

      if (stkRes.error) {
        setPayBtn(false);
        return showError(stkRes.error);
      }

      setPayBtn(false);
      showPending();
      startPolling();
    } catch {
      setPayBtn(false);
      showError('Network error. Please try again.');
    }
  });

  document.getElementById('mpesaPhone').addEventListener('keydown', e => {
    if (e.key === 'Enter') payBtn.click();
  });
})();
