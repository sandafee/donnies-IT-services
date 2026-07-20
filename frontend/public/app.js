// API Base URL config
const API_BASE = window.location.protocol + '//' + window.location.hostname + ':8080';

// App State
let state = {
  products: [],
  cart: JSON.parse(localStorage.getItem('nr_cart')) || [],
  categoryFilter: 'all',
  maxPriceLimit: 500000,
  searchQuery: '',
  sortBy: 'default',
  couponApplied: false,
  selectedProduct: null
};

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

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  fetchCategories();
  fetchProducts();
  renderCart();
});

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem('nr_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('nr_theme', newTheme);
}

// Fetch Products from API
async function fetchProducts() {
  const loader = document.getElementById('products-loader');
  const grid = document.getElementById('products-grid');
  
  if (loader) loader.classList.remove('hidden');
  if (grid) grid.innerHTML = '';

  try {
    let url = `${API_BASE}/api/products`;
    const params = [];
    if (state.categoryFilter !== 'all') {
      params.push(`category=${state.categoryFilter}`);
    }
    if (state.searchQuery) {
      params.push(`search=${encodeURIComponent(state.searchQuery)}`);
    }
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error('API server unreachable');
    state.products = await response.json();
    initHeroFloatingImages(state.products);
    filterAndRenderProducts();
  } catch (error) {
    console.error('Error fetching catalog:', error);
    if (grid) {
      grid.innerHTML = `
        <div class="tracker-error" style="grid-column: 1 / -1;">
          <i class="fa-solid fa-triangle-exclamation"></i>
          Could not load the catalog. Ensure backend server is running on port 8080.
        </div>
      `;
    }
  } finally {
    if (loader) loader.classList.add('hidden');
  }
}

// Filter, Sort and Render Products on Grid
function filterAndRenderProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  // Filter local state by price range
  let filtered = state.products.filter(p => p.price <= state.maxPriceLimit);

  // Apply sorting
  if (state.sortBy === 'price-asc') {
    filtered.sort((a, b) => a.price - b.price);
  } else if (state.sortBy === 'price-desc') {
    filtered.sort((a, b) => b.price - a.price);
  }

  document.getElementById('results-count').textContent = `Showing ${filtered.length} products`;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 40px;">
        <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 12px;"></i>
        <p>No products found matching filters.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const isOutOfStock = p.stock === 0;
    const imgUrl = (p.image_url.startsWith('http://') || p.image_url.startsWith('https://')) ? p.image_url : `${API_BASE}${p.image_url}`;
    return `
      <div class="product-card glass card-invisible" data-product-id="${p.id}">
        <div class="product-image-wrapper">
          <img src="${imgUrl}" alt="${escapeHTML(p.name)}" onerror="this.src='https://placehold.co/400x300?text=Tech+Asset'">
          ${isOutOfStock ? '<div class="product-badge" style="background:var(--danger)">Sold Out</div>' : `<div class="product-badge">${escapeHTML(p.category)}</div>`}
        </div>
        <div class="product-card-body">
          <span class="prod-category">${escapeHTML(p.category)}</span>
          <h3>${escapeHTML(p.name)}</h3>
          <p>${escapeHTML(p.description)}</p>
          <div class="product-hotline" style="margin-bottom: 12px; font-size: 0.8rem; color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-phone" style="color: var(--sapphire); font-size: 0.85rem;"></i>
            <span>Call to Order: <a href="tel:${escapeHTML(p.contact_phone || '+254712345678')}" style="color: var(--sapphire-light); font-weight: 600; text-decoration: none;">${escapeHTML(p.contact_phone || '+254 712 345678')}</a></span>
          </div>
          <div class="product-card-footer">
            <span class="price-tag">${formatCurrency(p.price)}</span>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-secondary btn-card" onclick="viewProductDetail(${p.id})">Details</button>
              <button class="btn btn-primary btn-card" ${isOutOfStock ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} onclick="addToCart(${p.id})">
                <i class="fa-solid fa-cart-plus"></i> Add
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Trigger staggered appear animations
  initCardAnimations();
}

/* ─── Hero Floating Images ──────────────────────────────── */
function initHeroFloatingImages(products) {
  const container = document.getElementById('hero-floating-images');
  if (!container) return;

  // Pick up to 6 products with images, shuffled for variety each load
  const pool = products
    .filter(p => p.image_url)
    .sort(() => Math.random() - 0.5)
    .slice(0, 6);

  if (pool.length === 0) return;

  container.innerHTML = pool.map(p => {
    const imgUrl = (p.image_url.startsWith('http://') || p.image_url.startsWith('https://'))
      ? p.image_url
      : `${API_BASE}${p.image_url}`;
    return `<img class="hero-float-img" src="${imgUrl}" alt="" draggable="false" loading="eager">`;
  }).join('');
}

/* ─── Card Appear + Click Animations ───────────────────── */
function initCardAnimations() {
  const cards = Array.from(document.querySelectorAll('.product-card.card-invisible'));
  if (!cards.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const card = entry.target;
      const idx = cards.indexOf(card);
      const staggerDelay = (idx % 4) * 95; // stagger groups of 4

      setTimeout(() => {
        card.classList.remove('card-invisible');
        card.classList.add('card-visible');
        card.addEventListener('animationend', () => {
          card.classList.remove('card-visible');
          card.style.opacity = '1';
          card.style.transform = 'none';
          card.style.filter = 'none';
        }, { once: true });
      }, staggerDelay);

      observer.unobserve(card);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });

  cards.forEach(card => {
    observer.observe(card);

    // Click pop — skip if user clicked a button inside the card
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      card.classList.remove('card-clicked');
      void card.offsetWidth; // force reflow to restart animation
      card.classList.add('card-clicked');
      card.addEventListener('animationend', () => card.classList.remove('card-clicked'), { once: true });
    });
  });
}

// View Product Details and fetch reviews
async function viewProductDetail(productId) {
  try {
    const response = await fetch(`${API_BASE}/api/products/${productId}`);
    if (!response.ok) throw new Error('Product details fetch failed');
    const product = await response.json();
    state.selectedProduct = product;

    // Populate details fields
    const detailImgUrl = (product.image_url.startsWith('http://') || product.image_url.startsWith('https://')) ? product.image_url : `${API_BASE}${product.image_url}`;
    document.getElementById('detail-product-img').src = detailImgUrl;
    document.getElementById('detail-product-img').onerror = function() { this.src = 'https://placehold.co/400x300?text=Tech+Asset'; };
    document.getElementById('detail-product-category').textContent = product.category;
    document.getElementById('detail-product-name').textContent = product.name;
    document.getElementById('detail-product-price').textContent = formatCurrency(product.price);
    document.getElementById('detail-product-desc').textContent = product.description;
    document.getElementById('detail-product-phone').textContent = product.contact_phone || '+254 712 345678';
    document.getElementById('detail-product-phone').href = `tel:${product.contact_phone || '+254712345678'}`;

    const stockBadge = document.getElementById('detail-stock-badge');
    if (product.stock === 0) {
      stockBadge.textContent = 'Out of Stock';
      stockBadge.className = 'stock-badge out';
      document.getElementById('detail-add-to-cart-btn').disabled = true;
      document.getElementById('detail-add-to-cart-btn').style.opacity = 0.5;
    } else {
      stockBadge.textContent = `In Stock (${product.stock} available)`;
      stockBadge.className = 'stock-badge in';
      document.getElementById('detail-add-to-cart-btn').disabled = false;
      document.getElementById('detail-add-to-cart-btn').style.opacity = 1;
    }

    // Render stars and rating averages
    const reviews = product.reviews || [];
    const avgRating = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : '0.0';
    document.getElementById('detail-rating-avg').textContent = `${avgRating} (${reviews.length} reviews)`;
    
    // Render stars representation
    const starsDiv = document.getElementById('detail-rating-stars');
    const fullStars = Math.round(Number(avgRating));
    starsDiv.innerHTML = Array(5).fill().map((_, i) => 
      `<i class="fa-solid fa-star${i < fullStars ? '' : ' -empty'}" style="color:${i < fullStars ? 'var(--warning)' : 'var(--text-muted)'}"></i>`
    ).join('');

    // Render Review list
    const reviewsContainer = document.getElementById('reviews-list');
    if (reviews.length === 0) {
      reviewsContainer.innerHTML = `<p style="color:var(--text-muted);font-style:italic;">No reviews yet. Be the first to review this tech!</p>`;
    } else {
      reviewsContainer.innerHTML = reviews.map(r => `
        <div class="review-item">
          <div class="review-item-header">
            <strong>${escapeHTML(r.reviewer_name)}</strong>
            <span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
          </div>
          <p>${escapeHTML(r.comment)}</p>
        </div>
      `).join('');
    }

    // Reset Form inputs
    document.getElementById('add-review-form').reset();

    // Open Modal
    document.getElementById('detail-modal').classList.add('open');
  } catch (error) {
    console.error('Error fetching detail:', error);
  }
}

// Shopping Cart Actions
function addToCart(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  const existing = state.cart.find(item => item.id === productId);
  if (existing) {
    if (existing.quantity >= prod.stock) {
      alert(`Cannot add more than ${prod.stock} units of ${prod.name} (stock limit).`);
      return;
    }
    existing.quantity += 1;
  } else {
    state.cart.push({
      id: prod.id,
      name: prod.name,
      price: prod.price,
      image_url: prod.image_url,
      quantity: 1,
      maxStock: prod.stock
    });
  }

  saveCartAndRender();
  // Open Cart drawer for immediate user confirmation
  document.getElementById('cart-drawer').classList.add('open');
}

function changeQuantity(productId, delta) {
  const item = state.cart.find(c => c.id === productId);
  if (!item) return;

  item.quantity += delta;
  
  if (item.quantity <= 0) {
    state.cart = state.cart.filter(c => c.id !== productId);
  } else if (item.quantity > item.maxStock) {
    alert(`Maximum available stock reached (${item.maxStock} items).`);
    item.quantity = item.maxStock;
  }

  saveCartAndRender();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(c => c.id !== productId);
  saveCartAndRender();
}

function saveCartAndRender() {
  localStorage.setItem('nr_cart', JSON.stringify(state.cart));
  renderCart();
}

function renderCart() {
  const countBadge = document.getElementById('cart-count');
  const container = document.getElementById('cart-items-container');
  const emptyView = document.getElementById('cart-empty');
  const footerView = document.getElementById('cart-footer');

  // Update counts
  const totalCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  countBadge.textContent = totalCount;

  if (state.cart.length === 0) {
    emptyView.classList.remove('hidden');
    footerView.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  emptyView.classList.add('hidden');
  footerView.classList.remove('hidden');

  // Render items list
  container.innerHTML = state.cart.map(item => {
    const cartImgUrl = (item.image_url.startsWith('http://') || item.image_url.startsWith('https://')) ? item.image_url : `${API_BASE}${item.image_url}`;
    return `
      <div class="cart-item">
        <img src="${cartImgUrl}" alt="${escapeHTML(item.name)}" onerror="this.src='https://placehold.co/80x60?text=Asset'">
      <div>
        <h5>${escapeHTML(item.name)}</h5>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQuantity(${item.id}, -1)">-</button>
          <span>${item.quantity}</span>
          <button class="qty-btn" onclick="changeQuantity(${item.id}, 1)">+</button>
          <button class="remove-item-btn" onclick="removeFromCart(${item.id})"><i class="fa-solid fa-trash"></i> Remove</button>
        </div>
      </div>
      <div class="cart-item-price">
        ${formatCurrency(item.price * item.quantity)}
      </div>
    </div>
    `;
  }).join('');

  // Calculate pricing
  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  let discount = 0;
  
  if (state.couponApplied) {
    discount = subtotal * 0.1;
    document.getElementById('discount-row').classList.remove('hidden');
    document.getElementById('cart-discount').textContent = `-${formatCurrency(discount)}`;
  } else {
    document.getElementById('discount-row').classList.add('hidden');
  }

  const finalAmount = subtotal - discount;
  document.getElementById('cart-subtotal').textContent = formatCurrency(subtotal);
  document.getElementById('cart-total').textContent = formatCurrency(finalAmount);
}

// Order Tracking Pipeline rendering
async function trackOrder(orderId) {
  const resultContainer = document.getElementById('tracker-result');
  const errorContainer = document.getElementById('tracker-error');
  
  resultContainer.classList.add('hidden');
  errorContainer.classList.add('hidden');

  if (!orderId) return;

  try {
    const res = await fetch(`${API_BASE}/api/orders/${orderId}`);
    if (!res.ok) {
      if (res.status === 404) {
        errorContainer.classList.remove('hidden');
        return;
      }
      throw new Error('Server error');
    }

    const order = await res.json();
    resultContainer.classList.remove('hidden');

    // Populate data fields
    document.getElementById('track-order-id').textContent = order.id;
    document.getElementById('track-cust-name').textContent = order.customer_name;
    document.getElementById('track-order-total').textContent = formatCurrency(order.total_amount);

    // Render items tracking table
    const itemsContainer = document.getElementById('track-items-list');
    itemsContainer.innerHTML = `
      <h5 style="margin-bottom:12px; font-weight:600;"><i class="fa-solid fa-receipt"></i> Items Purchased</h5>
      ${order.items.map(item => `
        <div class="tracker-item-row">
          <span>${escapeHTML(item.product_name)} <strong>x${item.quantity}</strong></span>
          <span>${formatCurrency(item.price * item.quantity)}</span>
        </div>
      `).join('')}
    `;

    // Process pipeline statuses
    const steps = ['Pending', 'Processing', 'Shipped', 'Delivered'];
    const activeIndex = steps.indexOf(order.status);
    
    // Update progress pipeline bar width
    const progressPercents = [0, 33.3, 66.6, 100];
    const widthPercentage = activeIndex !== -1 ? progressPercents[activeIndex] : 0;
    document.getElementById('pipeline-progress-bar').style.width = `${widthPercentage}%`;

    // Toggle CSS classes on steps
    steps.forEach((stepName, idx) => {
      const elementId = `step-${stepName.toLowerCase()}`;
      const element = document.getElementById(elementId);
      if (!element) return;

      element.classList.remove('active', 'completed');
      if (idx < activeIndex) {
        element.classList.add('completed');
      } else if (idx === activeIndex) {
        element.classList.add('active');
      }
    });

    if (order.status === 'Cancelled') {
      document.getElementById('pipeline-progress-bar').style.width = `0%`;
      steps.forEach(s => document.getElementById(`step-${s.toLowerCase()}`).classList.remove('active', 'completed'));
      alert('Note: This order has been Cancelled by the operations team.');
    }
  } catch (error) {
    console.error('Tracker error:', error);
    errorContainer.classList.remove('hidden');
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Cart drawer display toggles
  document.getElementById('cart-trigger').addEventListener('click', () => {
    document.getElementById('cart-drawer').classList.add('open');
  });
  document.getElementById('close-cart-btn').addEventListener('click', () => {
    document.getElementById('cart-drawer').classList.remove('open');
  });
  document.getElementById('cart-overlay').addEventListener('click', () => {
    document.getElementById('cart-drawer').classList.remove('open');
  });
  document.getElementById('start-shopping-btn').addEventListener('click', () => {
    document.getElementById('cart-drawer').classList.remove('open');
  });

  // Dynamic Category dropdown toggle logic (Sidebar)
  const dropBtn = document.getElementById('category-dropdown-btn');
  const dropMenu = document.getElementById('category-dropdown-menu');
  
  if (dropBtn && dropMenu) {
    dropBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const isHidden = dropMenu.classList.contains('hidden');
      if (isHidden) {
        await fetchCategories();
        dropMenu.classList.remove('hidden');
        dropMenu.style.display = 'flex';
      } else {
        dropMenu.classList.add('hidden');
        dropMenu.style.display = 'none';
      }
    });

    // Close when clicking outside
    document.addEventListener('click', () => {
      dropMenu.classList.add('hidden');
      dropMenu.style.display = 'none';
    });
  }

  // Header Categories Dropdown Toggle Logic
  const navCatsTrigger = document.getElementById('nav-cats-trigger');
  const navCatsMenu = document.getElementById('nav-categories-menu');

  if (navCatsTrigger && navCatsMenu) {
    navCatsTrigger.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isHidden = navCatsMenu.classList.contains('hidden');
      if (isHidden) {
        await fetchCategories();
        navCatsMenu.classList.remove('hidden');
        navCatsMenu.style.display = 'flex';
      } else {
        navCatsMenu.classList.add('hidden');
        navCatsMenu.style.display = 'none';
      }
    });

    // Close when clicking outside
    document.addEventListener('click', () => {
      navCatsMenu.classList.add('hidden');
      navCatsMenu.style.display = 'none';
    });
  }

  // Price range slider change
  const priceSlider = document.getElementById('price-range');
  priceSlider.addEventListener('input', (e) => {
    state.maxPriceLimit = Number(e.target.value);
    document.getElementById('price-limit-display').textContent = `${state.maxPriceLimit / 1000}K`;
    filterAndRenderProducts();
  });

  // Sort selector change
  document.getElementById('sort-select').addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    filterAndRenderProducts();
  });

  // Search input with query filtering
  let debounceTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      fetchProducts();
    }, 300);
  });

  // Navigation panel switching (Shop vs Tracker)
  const navShop = document.getElementById('nav-shop-btn');
  const navTrack = document.getElementById('nav-track-btn');
  const shopSection = document.getElementById('shop');
  const trackerSection = document.getElementById('tracker-section');
  const heroSection = document.querySelector('.hero-section');

  navShop.addEventListener('click', (e) => {
    e.preventDefault();
    navShop.classList.add('active');
    navTrack.classList.remove('active');
    shopSection.classList.remove('hidden');
    heroSection.classList.remove('hidden');
    trackerSection.classList.add('hidden');
  });

  navTrack.addEventListener('click', (e) => {
    e.preventDefault();
    navTrack.classList.add('active');
    navShop.classList.remove('active');
    shopSection.classList.add('hidden');
    heroSection.classList.add('hidden');
    trackerSection.classList.remove('hidden');
  });

  // Track button trigger in Hero
  document.querySelector('.hero-buttons .btn-secondary').addEventListener('click', (e) => {
    e.preventDefault();
    navTrack.click();
  });

  // Coupon Submission
  document.getElementById('apply-coupon-btn').addEventListener('click', () => {
    const input = document.getElementById('coupon-input').value.trim().toUpperCase();
    const msg = document.getElementById('coupon-message');
    
    if (input === 'DONNES10' || input === 'NAIROBI10') {
      state.couponApplied = true;
      state.appliedCouponCode = input;
      msg.textContent = 'Discount applied successfully!';
      msg.className = 'coupon-msg success';
      saveCartAndRender();
    } else {
      state.couponApplied = false;
      state.appliedCouponCode = null;
      msg.textContent = 'Invalid coupon code.';
      msg.className = 'coupon-msg error';
      saveCartAndRender();
    }
  });

  // Checkout modal displays
  document.getElementById('checkout-trigger-btn').addEventListener('click', () => {
    // Show checkout modal
    const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discount = state.couponApplied ? subtotal * 0.1 : 0;
    const finalAmount = subtotal - discount;
    
    document.getElementById('checkout-payable-display').textContent = formatCurrency(finalAmount);
    document.getElementById('checkout-modal').classList.add('open');
  });

  document.getElementById('close-checkout-modal').addEventListener('click', () => {
    document.getElementById('checkout-modal').classList.remove('open');
  });

  // Handle Order Submit Form
  document.getElementById('checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const checkoutBtn = document.getElementById('checkout-submit-btn');
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Processing checkout...';

    const orderPayload = {
      customer_name: document.getElementById('cust-name').value.trim(),
      customer_email: document.getElementById('cust-email').value.trim(),
      customer_phone: document.getElementById('cust-phone').value.trim(),
      customer_address: document.getElementById('cust-address').value.trim(),
      coupon_used: state.couponApplied ? (state.appliedCouponCode || 'DONNES10') : null,
      items: state.cart.map(item => ({
        product_id: item.id,
        quantity: item.quantity
      }))
    };

    try {
      const response = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Server rejected checkout');

      // Success
      document.getElementById('checkout-modal').classList.remove('open');
      document.getElementById('cart-drawer').classList.remove('open');
      
      // Clear Cart
      state.cart = [];
      state.couponApplied = false;
      document.getElementById('coupon-input').value = '';
      document.getElementById('coupon-message').textContent = '';
      saveCartAndRender();

      // Show success screen
      document.getElementById('success-tracking-id').textContent = result.order_id;
      document.getElementById('success-modal').classList.add('open');
    } catch (err) {
      alert(`Checkout Failed: ${err.message}`);
    } finally {
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = 'Place Order (Cash on Delivery)';
    }
  });

  // Copy tracking ID
  document.getElementById('copy-track-id-btn').addEventListener('click', () => {
    const orderId = document.getElementById('success-tracking-id').textContent;
    navigator.clipboard.writeText(orderId).then(() => {
      const btn = document.getElementById('copy-track-id-btn');
      btn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
      setTimeout(() => {
        btn.innerHTML = `<i class="fa-solid fa-copy"></i> Copy ID`;
      }, 2000);
    });
  });

  // Close success screen
  document.getElementById('close-success-btn').addEventListener('click', () => {
    document.getElementById('success-modal').classList.remove('open');
    fetchProducts(); // Refresh catalog stock display
  });

  // Track Form submission
  document.getElementById('track-submit-btn').addEventListener('click', () => {
    const id = document.getElementById('tracking-id-input').value.trim();
    trackOrder(id);
  });

  // Close detail modal
  document.getElementById('close-detail-modal').addEventListener('click', () => {
    document.getElementById('detail-modal').classList.remove('open');
  });

  // Add detail to cart
  document.getElementById('detail-add-to-cart-btn').addEventListener('click', () => {
    if (state.selectedProduct) {
      addToCart(state.selectedProduct.id);
      document.getElementById('detail-modal').classList.remove('open');
    }
  });

  // Submit Product Review Form
  document.getElementById('add-review-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.selectedProduct) return;

    const ratingInput = document.querySelector('input[name="rating-stars"]:checked');
    const reviewer_name = document.getElementById('review-name').value.trim();
    const comment = document.getElementById('review-comment').value.trim();

    if (!ratingInput) {
      alert('Please select a star rating.');
      return;
    }

    const reviewPayload = {
      reviewer_name,
      rating: parseInt(ratingInput.value),
      comment
    };

    try {
      const res = await fetch(`${API_BASE}/api/products/${state.selectedProduct.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewPayload)
      });

      if (!res.ok) throw new Error('Submission rejected');
      
      // Success: Re-fetch details to show updated reviews list
      viewProductDetail(state.selectedProduct.id);
    } catch (err) {
      alert(`Review Submission Failed: ${err.message}`);
    }
  });

  // Clear filters
  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    document.getElementById('search-input').value = '';
    state.searchQuery = '';
    
    const pills = document.querySelectorAll('#category-dropdown-menu .cat-pill');
    pills.forEach(p => {
      p.classList.remove('active');
      p.style.color = 'var(--text-secondary)';
      p.style.fontWeight = '500';
    });
    
    const allPill = document.querySelector('#category-dropdown-menu .cat-pill[data-category="all"]');
    if (allPill) {
      allPill.classList.add('active');
      allPill.style.color = 'var(--primary)';
      allPill.style.fontWeight = '700';
    }

    const activeLabel = document.getElementById('active-category-label');
    if (activeLabel) activeLabel.textContent = 'All Categories';
    state.categoryFilter = 'all';

    const priceSlider = document.getElementById('price-range');
    priceSlider.value = 500000;
    state.maxPriceLimit = 500000;
    document.getElementById('price-limit-display').textContent = `500K`;

    document.getElementById('sort-select').value = 'default';
    state.sortBy = 'default';

    fetchProducts();
  });
}

// Fetch categories from database and render dropdown content dynamically
async function fetchCategories() {
  try {
    const res = await fetch(`${API_BASE}/api/categories`);
    if (!res.ok) throw new Error('Categories fetch failed');
    const data = await res.json();
    renderCategoryDropdown(data);
  } catch (error) {
    console.error('Error fetching categories:', error);
  }
}

function renderCategoryDropdown(categories) {
  const sidebarMenu = document.getElementById('category-dropdown-menu');
  const navMenu = document.getElementById('nav-categories-menu');
  
  if (!sidebarMenu && !navMenu) return;

  // 1. Render Sidebar Menu
  if (sidebarMenu) {
    let sidebarHtml = `
      <button class="cat-pill active" data-category="all" style="width:100%; text-align:left; padding:10px 14px; border:none; background:transparent; color:var(--primary); font-weight:700; cursor:pointer; font-size:0.875rem; border-radius:var(--radius-xs); transition:var(--transition);">
        All Categories
      </button>
    `;
    categories.forEach(cat => {
      sidebarHtml += `
        <button class="cat-pill" data-category="${escapeHTML(cat.name)}" style="width:100%; text-align:left; padding:10px 14px; border:none; background:transparent; color:var(--text-secondary); cursor:pointer; font-size:0.875rem; border-radius:var(--radius-xs); transition:var(--transition);">
          ${escapeHTML(cat.name)}
        </button>
      `;
    });
    sidebarMenu.innerHTML = sidebarHtml;
  }

  // 2. Render Navbar Header Dropdown Menu
  if (navMenu) {
    let navHtml = `
      <button class="nav-cat-item active" data-category="all" style="width:100%; text-align:left; padding:10px 14px; border:none; background:transparent; color:var(--primary); font-weight:700; cursor:pointer; font-size:0.85rem; border-radius:var(--radius-xs); transition:var(--transition); display:flex; align-items:center; gap:8px;">
        All Categories
      </button>
    `;
    categories.forEach(cat => {
      navHtml += `
        <button class="nav-cat-item" data-category="${escapeHTML(cat.name)}" style="width:100%; text-align:left; padding:10px 14px; border:none; background:transparent; color:var(--text-secondary); cursor:pointer; font-size:0.85rem; border-radius:var(--radius-xs); transition:var(--transition); display:flex; align-items:center; gap:8px;">
          ${escapeHTML(cat.name)}
        </button>
      `;
    });
    navMenu.innerHTML = navHtml;
  }

  // 3. Shared Filter Applying Function
  const applyFilter = (selectedCat) => {
    state.categoryFilter = selectedCat;
    
    // Sync active style for sidebar pills
    if (sidebarMenu) {
      const pills = sidebarMenu.querySelectorAll('.cat-pill');
      pills.forEach(p => {
        const cat = p.getAttribute('data-category');
        if (cat === selectedCat) {
          p.classList.add('active');
          p.style.color = 'var(--primary)';
          p.style.fontWeight = '700';
        } else {
          p.classList.remove('active');
          p.style.color = 'var(--text-secondary)';
          p.style.fontWeight = '500';
        }
      });
    }

    // Sync active style for nav items
    if (navMenu) {
      const navItems = navMenu.querySelectorAll('.nav-cat-item');
      navItems.forEach(n => {
        const cat = n.getAttribute('data-category');
        if (cat === selectedCat) {
          n.classList.add('active');
          n.style.color = 'var(--primary)';
          n.style.fontWeight = '700';
        } else {
          n.classList.remove('active');
          n.style.color = 'var(--text-secondary)';
          n.style.fontWeight = '500';
        }
      });
    }

    // Update active category text display
    const activeLabel = document.getElementById('active-category-label');
    if (activeLabel) {
      activeLabel.textContent = selectedCat === 'all' ? 'All Categories' : selectedCat;
    }

    fetchProducts();
  };

  // Bind Sidebar items click events
  if (sidebarMenu) {
    sidebarMenu.querySelectorAll('.cat-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedCat = pill.getAttribute('data-category');
        applyFilter(selectedCat);
        sidebarMenu.classList.add('hidden');
        sidebarMenu.style.display = 'none';
      });
    });
  }

  // Bind Navbar Header items click events
  if (navMenu) {
    navMenu.querySelectorAll('.nav-cat-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedCat = item.getAttribute('data-category');
        applyFilter(selectedCat);
        navMenu.classList.add('hidden');
        navMenu.style.display = 'none';
        
        // Smoothly scroll to catalog section
        const shopSection = document.getElementById('shop');
        if (shopSection) {
          shopSection.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }
}
