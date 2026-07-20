// API Base URL config
const API_BASE = window.location.protocol + '//' + window.location.hostname + ':8080';

// Global Admin State
let state = {
  products: [],
  orders: [],
  categories: [],
  stats: {},
  activeSection: 'dashboard',
  inventorySearch: '',
  ordersSearch: ''
};

// Chart reference
let salesChart = null;

// Currency Formatter
function formatCurrency(amount) {
  return 'KES ' + Number(amount).toLocaleString('en-KE');
}

// HTML Escaper for XSS Prevention
function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Initializer
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupNavigation();
  setupEventListeners();
  loadAllData();
});

// Load everything
async function loadAllData() {
  await fetchStats();
  await fetchInventory();
  await fetchOrders();
  await fetchCategories();
}

// Theme
function initTheme() {
  const savedTheme = localStorage.getItem('nr_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('nr_theme', newTheme);
  });
}

function setupNavigation() {
  const links = {
    'menu-dash-btn': 'dashboard',
    'menu-inv-btn': 'inventory',
    'menu-cats-btn': 'categories',
    'menu-orders-btn': 'orders'
  };

  Object.entries(links).forEach(([btnId, sectionName]) => {
    document.getElementById(btnId).addEventListener('click', (e) => {
      e.preventDefault();
      
      // Update sidebar buttons
      Object.keys(links).forEach(id => document.getElementById(id).classList.remove('active'));
      document.getElementById('menu-add-prod-btn').classList.remove('active');
      document.getElementById(btnId).classList.add('active');

      // Update sections display
      Object.values(links).forEach(sec => {
        document.getElementById(`section-${sec}`).classList.add('hidden');
      });
      document.getElementById(`section-${sectionName}`).classList.remove('hidden');

      // Update Title
      const titles = {
        'dashboard': 'Dashboard Overview',
        'inventory': 'Inventory Management',
        'categories': 'Category Management',
        'orders': 'Order Operations'
      };
      document.getElementById('page-title').textContent = titles[sectionName];
      state.activeSection = sectionName;

      // Reload appropriate dataset on tab change
      loadAllData();
    });
  });

  // Dedicated Add Product Tab Behavior
  document.getElementById('menu-add-prod-btn').addEventListener('click', (e) => {
    e.preventDefault();
    // Simulate clicking Inventory tab to change views
    document.getElementById('menu-inv-btn').click();
    // Mark Add Product button as active visually
    document.getElementById('menu-inv-btn').classList.remove('active');
    document.getElementById('menu-add-prod-btn').classList.add('active');
    // Open product creation modal
    openAddProductModal();
  });
}

// Fetch stats and render chart
async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/api/dashboard/stats`);
    if (!res.ok) throw new Error('Failed to load stats');
    const stats = await res.json();
    state.stats = stats;

    // Render Stats values
    document.getElementById('stat-sales').textContent = formatCurrency(stats.totalSales);
    document.getElementById('stat-orders').textContent = stats.totalOrders;
    document.getElementById('stat-out-of-stock').textContent = stats.outOfStockCount;
    document.getElementById('stat-low-stock').textContent = stats.lowStockCount;

    renderSalesChart(stats.salesByDay);
  } catch (error) {
    console.error('Stats loading error:', error);
  }
}

// Render chart with Chart.js
function renderSalesChart(salesByDay) {
  const ctx = document.getElementById('salesTrendChart').getContext('2d');
  if (!ctx) return;

  if (salesChart) {
    salesChart.destroy();
  }

  // If no sales history, display dummy message or default coordinates
  const labels = salesByDay.length > 0 ? salesByDay.map(s => s.date) : ['No Data'];
  const data = salesByDay.length > 0 ? salesByDay.map(s => s.sales) : [0];

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor = isDark ? 'rgba(99,153,255,0.07)' : 'rgba(33,90,210,0.06)';
  const tickColor = isDark ? 'rgba(200,215,255,0.45)' : 'rgba(33,60,120,0.55)';

  salesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Sales Revenue (KES)',
        data: data,
        borderColor: 'hsl(213,94%,58%)',
        backgroundColor: 'rgba(99,153,255,0.07)',
        borderWidth: 2.5,
        pointBackgroundColor: 'hsl(213,94%,58%)',
        pointBorderColor: isDark ? 'hsl(222,44%,11%)' : '#fff',
        pointBorderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 8,
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? 'hsl(222,44%,13%)' : '#fff',
          borderColor: 'rgba(99,153,255,0.25)',
          borderWidth: 1,
          titleColor: isDark ? 'rgba(200,215,255,0.9)' : 'hsl(222,42%,18%)',
          bodyColor: isDark ? 'rgba(200,215,255,0.65)' : 'hsl(222,28%,38%)',
          callbacks: {
            label: ctx => ' KES ' + Number(ctx.raw).toLocaleString('en-KE')
          }
        }
      },
      scales: {
        y: {
          grid: { color: gridColor, drawBorder: false },
          border: { display: false },
          ticks: {
            color: tickColor,
            font: { size: 11 },
            callback: value => 'KES ' + (value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value)
          }
        },
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: tickColor, font: { size: 11 } }
        }
      }
    }
  });
}

// Fetch products & render table
async function fetchInventory() {
  try {
    const res = await fetch(`${API_BASE}/api/products`);
    if (!res.ok) throw new Error('Inventory load failed');
    state.products = await res.json();
    renderInventoryTable();
  } catch (error) {
    console.error('Inventory error:', error);
  }
}

function renderInventoryTable() {
  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;

  // Filter local state
  let filtered = state.products.filter(p => 
    p.name.toLowerCase().includes(state.inventorySearch.toLowerCase()) || 
    p.category.toLowerCase().includes(state.inventorySearch.toLowerCase())
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; color:var(--text-secondary); padding: 32px;">
          No matching products found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    let stockBadgeClass = 'badge status-shipped';
    let stockText = `${p.stock} units`;
    
    if (p.stock === 0) {
      stockBadgeClass = 'badge status-cancelled';
      stockText = 'Out of Stock';
    } else if (p.stock <= 3) {
      stockBadgeClass = 'badge status-pending';
      stockText = `Low Stock: ${p.stock}`;
    }

    const imgUrl = (p.image_url.startsWith('http://') || p.image_url.startsWith('https://')) ? p.image_url : `${API_BASE}${p.image_url}`;
    return `
      <tr>
        <td><span class="order-id-badge">#${p.id}</span></td>
        <td><img class="table-prod-img" src="${imgUrl}" alt="${escapeHTML(p.name)}" onerror="this.src='https://placehold.co/80x60?text=Asset'"></td>
        <td>
          <div style="font-weight:600;">${escapeHTML(p.name)}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;">${escapeHTML(p.description)}</div>
        </td>
        <td>${escapeHTML(p.category)}</td>
        <td><strong>${formatCurrency(p.price)}</strong></td>
        <td><span class="${stockBadgeClass}">${stockText}</span></td>
        <td>
          <div class="action-btns">
            <button class="btn-action" onclick="openEditProductModal(${p.id})"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn-action btn-danger" onclick="deleteProduct(${p.id})"><i class="fa-solid fa-trash"></i> Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Fetch orders & render table
async function fetchOrders() {
  try {
    const res = await fetch(`${API_BASE}/api/orders`);
    if (!res.ok) throw new Error('Orders load failed');
    state.orders = await res.json();
    renderOrdersTable();
  } catch (error) {
    console.error('Orders error:', error);
  }
}

function renderOrdersTable() {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;

  // Filter orders
  let filtered = state.orders.filter(o => 
    o.customer_name.toLowerCase().includes(state.ordersSearch.toLowerCase()) ||
    o.id.toString().includes(state.ordersSearch) ||
    o.customer_email.toLowerCase().includes(state.ordersSearch.toLowerCase())
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; color:var(--text-secondary); padding: 32px;">
          No matching orders found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(o => {
    const dateFormatted = new Date(o.created_at).toLocaleDateString('en-KE', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const itemsSummary = o.items.map(i => `${escapeHTML(i.product_name)} (x${i.quantity})`).join(', ');

    return `
      <tr>
        <td><span class="order-id-badge">#${o.id}</span></td>
        <td>
          <div style="font-weight:600;">${escapeHTML(o.customer_name)}</div>
          <div style="font-size:0.8rem; color:var(--text-secondary);">${escapeHTML(o.customer_phone)} | ${escapeHTML(o.customer_email)}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-style:italic;"><i class="fa-solid fa-location-dot"></i> ${escapeHTML(o.customer_address)}</div>
        </td>
        <td style="max-width:280px; font-size:0.85rem; color:var(--text-secondary);">${itemsSummary}</td>
        <td><code>${escapeHTML(o.coupon_used || '-')}</code></td>
        <td><strong style="color:var(--primary);">${formatCurrency(o.total_amount)}</strong></td>
        <td><span style="font-size:0.8rem; color:var(--text-secondary);">${dateFormatted}</span></td>
        <td>
          <select class="status-select" onchange="updateOrderStatus(${o.id}, this.value)">
            <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
            <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
            <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
            <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');
}

// Update Order Status
async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Status update failed');
    
    // Success, load updated stats & orders
    loadAllData();
  } catch (error) {
    alert(`Could not update order status: ${error.message}`);
  }
}

// Product Management CRUD
// Helper: Update image preview in modal
function updateImagePreview(src) {
  const preview = document.getElementById('prod-img-preview');
  const placeholder = document.getElementById('img-preview-placeholder');
  if (!preview || !placeholder) return;

  if (src && src.trim() && !src.startsWith('Uploading')) {
    const fullSrc = (src.startsWith('http://') || src.startsWith('https://')) ? src : `${API_BASE}${src}`;
    preview.src = fullSrc;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    preview.onerror = () => {
      preview.style.display = 'none';
      placeholder.style.display = 'flex';
    };
  } else {
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
  }
}

async function openAddProductModal() {
  document.getElementById('edit-product-id').value = '';
  document.getElementById('product-form').reset();
  // Reset image preview
  updateImagePreview('');
  const dropzoneLabel = document.getElementById('upload-dropzone-label');
  if (dropzoneLabel) dropzoneLabel.textContent = 'Click or drag to upload image file (Max 10MB)';
  
  // Make sure dynamic categories dropdown is up-to-date
  await fetchCategories();
  
  document.getElementById('modal-title').textContent = 'Add Tech Listing';
  document.getElementById('product-modal').classList.add('open');
}

async function openEditProductModal(productId) {
  const p = state.products.find(item => item.id === productId);
  if (!p) return;

  // Make sure categories are synced before selecting option value
  await fetchCategories();

  document.getElementById('edit-product-id').value = p.id;
  document.getElementById('prod-name').value = p.name;
  document.getElementById('prod-category').value = p.category;
  document.getElementById('prod-price').value = p.price;
  document.getElementById('prod-stock').value = p.stock;
  document.getElementById('prod-phone').value = p.contact_phone || '+254 712 345678';
  document.getElementById('prod-image').value = p.image_url;
  document.getElementById('prod-desc').value = p.description;
  // Show image preview
  updateImagePreview(p.image_url);
  const dropzoneLabel = document.getElementById('upload-dropzone-label');
  if (dropzoneLabel) dropzoneLabel.textContent = 'Click or drag to replace image file';

  document.getElementById('modal-title').textContent = 'Edit Tech Listing';
  document.getElementById('product-modal').classList.add('open');
}

async function deleteProduct(productId) {
  if (!confirm('Are you sure you want to delete this listing from DONNES I.T SERVICES?')) return;

  try {
    const res = await fetch(`${API_BASE}/api/products/${productId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Deletion failed');
    
    // Refresh
    loadAllData();
  } catch (error) {
    alert(`Deletion error: ${error.message}`);
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Modal close buttons
  document.getElementById('close-product-modal').addEventListener('click', () => {
    document.getElementById('product-modal').classList.remove('open');
  });

  // Open modal
  document.getElementById('add-product-btn').addEventListener('click', openAddProductModal);

  // Submit product form
  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const productId = document.getElementById('edit-product-id').value;
    const name = document.getElementById('prod-name').value.trim();
    const category = document.getElementById('prod-category').value;
    const price = parseFloat(document.getElementById('prod-price').value);
    const stock = parseInt(document.getElementById('prod-stock').value);
    const contact_phone = document.getElementById('prod-phone').value.trim();
    const image_url = document.getElementById('prod-image').value.trim();
    const description = document.getElementById('prod-desc').value.trim();

    const payload = { name, category, price, stock, contact_phone, image_url, description };
    
    let url = `${API_BASE}/api/products`;
    let method = 'POST';

    // If edit mode
    if (productId) {
      url += `/${productId}`;
      method = 'PUT';
    }

    try {
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to save listing');

      // Success
      document.getElementById('product-modal').classList.remove('open');
      loadAllData();
    } catch (error) {
      alert(`Error saving listing: ${error.message}`);
    }
  });

  // Upload local image file to base64 API handler
  document.getElementById('prod-image-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const imgField = document.getElementById('prod-image');
    const dropzoneLabel = document.getElementById('upload-dropzone-label');
    const oldPlaceholder = imgField.value;
    imgField.value = 'Uploading file, please wait...';
    imgField.disabled = true;
    if (dropzoneLabel) dropzoneLabel.textContent = `Uploading ${file.name}...`;
    updateImagePreview('');

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            base64Data: reader.result
          })
        });

        if (!response.ok) throw new Error('Backend rejected file upload');
        const data = await response.json();
        
        imgField.value = data.image_url;
        // Show live preview after upload
        updateImagePreview(data.image_url);
        if (dropzoneLabel) dropzoneLabel.textContent = `✔ Uploaded: ${file.name}`;
      } catch (err) {
        alert(`File Upload Failed: ${err.message}`);
        imgField.value = oldPlaceholder;
        if (dropzoneLabel) dropzoneLabel.textContent = 'Click or drag to upload image file (Max 10MB)';
      } finally {
        imgField.disabled = false;
      }
    };
    reader.readAsDataURL(file);
  });

  // Live preview update when URL is typed manually
  document.getElementById('prod-image').addEventListener('input', (e) => {
    updateImagePreview(e.target.value.trim());
  });

  // Submit category additions form
  document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('new-cat-name');
    const name = input.value.trim();
    if (!name) return;

    try {
      const res = await fetch(`${API_BASE}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Server error');
      }

      input.value = '';
      await fetchCategories();
    } catch (error) {
      alert(`Could not save new category: ${error.message}`);
    }
  });

  // Search filter typing hooks
  document.getElementById('inventory-search').addEventListener('input', (e) => {
    state.inventorySearch = e.target.value.trim();
    renderInventoryTable();
  });

  document.getElementById('orders-search').addEventListener('input', (e) => {
    state.ordersSearch = e.target.value.trim();
    renderOrdersTable();
  });
}

// Fetch categories from API and render select options + dynamic manager table
async function fetchCategories() {
  try {
    const res = await fetch(`${API_BASE}/api/categories`);
    if (!res.ok) throw new Error('Categories fetch failed');
    state.categories = await res.json();
    
    // Populate dropdown select list inside the modal form
    const select = document.getElementById('prod-category');
    if (select) {
      select.innerHTML = state.categories.map(c => `
        <option value="${c.name}">${c.name}</option>
      `).join('');
    }

    renderCategoriesTable();
  } catch (error) {
    console.error('Error fetching categories list:', error);
  }
}

function renderCategoriesTable() {
  const tbody = document.getElementById('categories-table-body');
  if (!tbody) return;

  if (state.categories.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align:center; padding: 20px; color: var(--text-muted);">
          No categories created yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.categories.map(c => `
    <tr>
      <td><span class="order-id-badge">#${c.id}</span></td>
      <td style="font-weight:600;">${escapeHTML(c.name)}</td>
      <td style="text-align:right;">
        <button class="btn-action btn-danger" onclick="deleteCategory(${c.id}, '${escapeHTML(c.name).replace(/'/g, '&#39;')}')">
          <i class="fa-solid fa-trash"></i> Delete
        </button>
      </td>
    </tr>
  `).join('');
}

// Delete a category by ID
async function deleteCategory(categoryId, categoryName) {
  if (!confirm(`Delete category "${categoryName}"? Products using this category will keep the value but it will no longer appear in the dropdown.`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/categories/${categoryId}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Deletion failed');
    }
    // Refresh data after deletion
    await fetchCategories();
  } catch (error) {
    alert(`Could not delete category: ${error.message}`);
  }
}
