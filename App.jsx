import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  AlertCircle, 
  Calendar, 
  TrendingUp, 
  Bot, 
  Send, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  Copy,
  Check,
  RefreshCw,
  Search,
  Filter,
  ExternalLink,
  MessageSquare,
  Mail,
  HelpCircle,
  Bell,
  User,
  ArrowUpRight,
  Settings,
  Plus,
  Key,
  ShieldCheck,
  FileText,
  Download,
  Info,
  CheckCircle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function App() {
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Navigation State: 'dashboard', 'links', 'ledger', 'config'
  const [activeTab, setActiveTab] = useState('dashboard');

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // AI Modal State
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [reminderText, setReminderText] = useState('');
  const [generatingReminder, setGeneratingReminder] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Create Payment Link Modal State
  const [createLinkModalOpen, setCreateLinkModalOpen] = useState(false);
  const [newPayment, setNewPayment] = useState({
    customer_name: '',
    customer_email: '',
    amount: '',
    due_date: '',
    description: ''
  });
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [createSuccessAlert, setCreateSuccessAlert] = useState(false);

  // Local Simulation State
  const [simulatedSent, setSimulatedSent] = useState({});
  const [simulatedPaid, setSimulatedPaid] = useState({});

  // Syncing state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // AI Refinement state
  const [refinementInput, setRefinementInput] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSuccessAlert, setEmailSuccessAlert] = useState(null);
  const [refiningReminder, setRefiningReminder] = useState(false);

  // Razorpay Webhook Simulation & Smart Settlement States
  const [webhookAlert, setWebhookAlert] = useState(null);
  const [simulatingWebhookId, setSimulatingWebhookId] = useState(null);
  const [generatingSettlement, setGeneratingSettlement] = useState(false);
  const [activeSettlementStrategy, setActiveSettlementStrategy] = useState(null);

  // Bulk AI Agent state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkRecommendations, setBulkRecommendations] = useState([]);
  const [bulkSummary, setBulkSummary] = useState('');
  const [loadingBulk, setLoadingBulk] = useState(false);

  // Dynamic Credentials State (Synchronized with localStorage)
  const [nvidiaApiKey, setNvidiaApiKey] = useState(localStorage.getItem('nvidia_api_key') || '');
  const [rzpKeyId, setRzpKeyId] = useState(localStorage.getItem('rzp_key_id') || '');
  const [rzpKeySecret, setRzpKeySecret] = useState(localStorage.getItem('rzp_key_secret') || '');
  const [selectedModel, setSelectedModel] = useState(localStorage.getItem('nvidia_model') || 'meta/llama-3.2-11b-vision-instruct');
  const [gmailUser, setGmailUser] = useState(localStorage.getItem('gmail_user') || '');
  const [gmailAppPassword, setGmailAppPassword] = useState(localStorage.getItem('gmail_app_password') || '');
  const [showKeys, setShowKeys] = useState(false);
  const [configSavedAlert, setConfigSavedAlert] = useState(false);

  const getApiHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    if (nvidiaApiKey) headers['x-nvidia-api-key'] = nvidiaApiKey;
    if (rzpKeyId) headers['x-razorpay-key-id'] = rzpKeyId;
    if (rzpKeySecret) headers['x-razorpay-key-secret'] = rzpKeySecret;
    if (selectedModel) headers['x-nvidia-model'] = selectedModel;
    if (gmailUser) headers['x-smtp-user'] = gmailUser;
    if (gmailAppPassword) headers['x-smtp-pass'] = gmailAppPassword;
    return headers;
  };

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const payRes = await fetch(`${API_BASE}/api/payments`, { headers: getApiHeaders() });
      if (!payRes.ok) throw new Error('Failed to fetch payments data');
      const paymentsData = await payRes.json();
      
      const sumRes = await fetch(`${API_BASE}/api/cashflow-summary`, { headers: getApiHeaders() });
      if (!sumRes.ok) throw new Error('Failed to fetch cash-flow summary');
      const summaryData = await sumRes.json();
      
      setPayments(paymentsData);
      setSummary(summaryData);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not connect to backend server. Make sure backend is running.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSyncPayments = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/payments/sync`, {
        method: 'POST',
        headers: getApiHeaders()
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to sync statuses');
      }
      const data = await res.json();
      setSyncResult(data.message);
      await fetchData(true); // reload data
      setTimeout(() => setSyncResult(null), 4000);
    } catch (err) {
      console.error(err);
      alert(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleGenerateReminder = async (payment) => {
    setSelectedPayment(payment);
    setGeneratingReminder(true);
    setModalOpen(true);
    setReminderText('');
    setCopied(false);

    try {
      const res = await fetch(`${API_BASE}/api/generate-reminder/${payment.id}`, { headers: getApiHeaders() });
      if (!res.ok) throw new Error('Failed to generate reminder');
      const data = await res.json();
      setReminderText(data.reminderMessage);
    } catch (err) {
      console.error(err);
      setReminderText(`Error generating draft: ${err.message}. Falling back to standard template.`);
    } finally {
      setGeneratingReminder(false);
    }
  };

  const handleRefineReminder = async () => {
    if (!refinementInput.trim() || !selectedPayment) return;
    setRefiningReminder(true);
    try {
      const res = await fetch(`${API_BASE}/api/refine-reminder`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          paymentId: selectedPayment.id,
          currentDraft: reminderText,
          instruction: refinementInput
        })
      });
      if (!res.ok) throw new Error('Failed to refine reminder');
      const data = await res.json();
      setReminderText(data.refinedMessage);
      setRefinementInput('');
    } catch (err) {
      console.error(err);
      alert(`Refinement failed: ${err.message}`);
    } finally {
      setRefiningReminder(false);
    }
  };

  const handleRunBulkAudit = async () => {
    setLoadingBulk(true);
    setBulkModalOpen(true);
    setBulkSummary('');
    setBulkRecommendations([]);
    try {
      const res = await fetch(`${API_BASE}/api/generate-bulk-nudges`, {
        method: 'POST',
        headers: getApiHeaders()
      });
      if (!res.ok) throw new Error('Bulk collections agent analysis failed');
      const data = await res.json();
      setBulkSummary(data.summary);
      setBulkRecommendations(data.recommendations);
    } catch (err) {
      console.error(err);
      alert(`Bulk Audit failed: ${err.message}`);
      setBulkModalOpen(false);
    } finally {
      setLoadingBulk(false);
    }
  };

  const handleCreatePaymentLink = async (e) => {
    e.preventDefault();
    if (!newPayment.customer_name || !newPayment.customer_email || !newPayment.amount || !newPayment.due_date) {
      alert('Please fill in all required fields.');
      return;
    }

    setSubmittingPayment(true);
    try {
      const res = await fetch(`${API_BASE}/api/payments`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          amount: parseFloat(newPayment.amount),
          customer_name: newPayment.customer_name,
          customer_email: newPayment.customer_email,
          due_date: newPayment.due_date,
          description: newPayment.description
        })
      });

      if (!res.ok) throw new Error('Failed to create payment link on server');
      
      await fetchData(true);
      setCreateLinkModalOpen(false);
      setNewPayment({
        customer_name: '',
        customer_email: '',
        amount: '',
        due_date: '',
        description: ''
      });
      setCreateSuccessAlert(true);
      setTimeout(() => setCreateSuccessAlert(false), 4000);
    } catch (err) {
      console.error(err);
      alert(`Error creating payment link: ${err.message}`);
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleMarkAsSent = (paymentId) => {
    setSimulatedSent(prev => ({
      ...prev,
      [paymentId]: true
    }));
  };

  const handleSendEmail = async () => {
    if (!selectedPayment || !reminderText) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`${API_BASE}/api/send-email`, {
        method: 'POST',
        headers: {
          ...getApiHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: selectedPayment.customer_email,
          subject: `Invoice Payment Reminder - ${selectedPayment.id}`,
          text: reminderText,
          paymentId: selectedPayment.id,
          smtpUser: gmailUser,
          smtpPass: gmailAppPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email');
      
      handleMarkAsSent(selectedPayment.id);
      setEmailSuccessAlert(data.message);
      setTimeout(() => setEmailSuccessAlert(null), 6000);
      setModalOpen(false);
    } catch (err) {
      console.error(err);
      alert(`Error sending email: ${err.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSimulateWebhook = async (paymentId) => {
    setSimulatingWebhookId(paymentId);
    try {
      const res = await fetch(`${API_BASE}/api/webhooks/simulate-payment`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ paymentId, event: 'payment_link.paid' })
      });
      if (!res.ok) throw new Error('Failed to simulate Razorpay webhook');
      const data = await res.json();

      // Instantly reconcile in UI
      setSimulatedPaid(prev => ({
        ...prev,
        [paymentId]: true
      }));

      setWebhookAlert(data.message);
      setTimeout(() => setWebhookAlert(null), 6000);

      // Reload fresh data from server
      await fetchData(true);
    } catch (err) {
      console.error(err);
      alert(`Webhook error: ${err.message}`);
    } finally {
      setSimulatingWebhookId(null);
    }
  };

  const handleGenerateSettlement = async (strategy) => {
    if (!selectedPayment) return;
    setGeneratingSettlement(true);
    setActiveSettlementStrategy(strategy);
    try {
      const res = await fetch(`${API_BASE}/api/negotiate-settlement`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          paymentId: selectedPayment.id,
          strategy,
          payment: selectedPayment,
          amount: selectedPayment.amount,
          customer_name: selectedPayment.customer_name,
          customer_email: selectedPayment.customer_email,
          description: selectedPayment.description,
          short_url: selectedPayment.short_url
        })
      });
      if (!res.ok) throw new Error('Failed to generate smart settlement proposal');
      const data = await res.json();
      if (data.offer && data.offer.defaultDraft) {
        setReminderText(data.offer.defaultDraft);
      }
    } catch (err) {
      console.error(err);
      alert(`Settlement generation failed: ${err.message}`);
    } finally {
      setGeneratingSettlement(false);
    }
  };

  const handleMarkAsPaid = async (paymentId) => {
    setSimulatedPaid(prev => ({
      ...prev,
      [paymentId]: true
    }));
    
    const payment = payments.find(p => p.id === paymentId);
    if (payment && summary) {
      const amt = payment.amount;
      setSummary(prev => {
        const isOverdue = payment.status === 'overdue';
        const newOverdue = isOverdue ? Math.max(0, prev.totalOverdue - amt) : prev.totalOverdue;
        
        const newScore = Math.min(100, Math.round((newOverdue / prev.averageMonthlyInflow) * 100));
        let newLevel = 'LOW';
        if (newScore >= 50) newLevel = 'CRITICAL';
        else if (newScore >= 25) newLevel = 'HIGH';
        else if (newScore >= 10) newLevel = 'MEDIUM';

        return {
          ...prev,
          totalOverdue: newOverdue,
          riskScore: newScore,
          riskLevel: newLevel,
          explanation: `Your outstanding overdue payments total ₹${newOverdue.toLocaleString('en-IN')}. This represents ${newScore}% of your mock average monthly inflow (₹${prev.averageMonthlyInflow.toLocaleString('en-IN')}).`
        };
      });
    }
  };

  const handleSaveConfigs = (e) => {
    e.preventDefault();
    localStorage.setItem('nvidia_api_key', nvidiaApiKey);
    localStorage.setItem('rzp_key_id', rzpKeyId);
    localStorage.setItem('rzp_key_secret', rzpKeySecret);
    localStorage.setItem('nvidia_model', selectedModel);
    localStorage.setItem('gmail_user', gmailUser);
    localStorage.setItem('gmail_app_password', gmailAppPassword);
    
    setConfigSavedAlert(true);
    setTimeout(() => setConfigSavedAlert(false), 3000);
  };

  const copyToClipboard = (text = reminderText) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportLedgerCSV = () => {
    // Generate simple CSV download
    const headers = ['Payment ID', 'Customer Name', 'Customer Email', 'Amount (INR)', 'Due Date', 'Status', 'Description', 'Link'];
    const rows = payments.map(p => {
      const isSimPaid = simulatedPaid[p.id];
      const status = isSimPaid ? 'paid' : p.status;
      return [
        p.id,
        `"${p.customer_name}"`,
        p.customer_email,
        p.amount,
        p.due_date,
        status,
        `"${p.description}"`,
        p.short_url
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `paypulse_ledger_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getForecastChartData = () => {
    if (payments.length === 0) return [];
    
    const chartData = [];
    let runningTotal = 0;
    
    const activePayments = payments.filter(p => !simulatedPaid[p.id]);
    const today = new Date();
    
    for (let i = 0; i <= 30; i++) {
      const date = new Date();
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      const duesOnDay = activePayments
        .filter(p => p.due_date === dateStr)
        .reduce((sum, p) => sum + p.amount, 0);
        
      runningTotal += duesOnDay;
      
      chartData.push({
        dateLabel: date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        "Cumulative Cash": runningTotal,
        "Daily Inflow": duesOnDay
      });
    }
    return chartData;
  };

  const filteredPayments = payments.filter(p => {
    const currentStatus = simulatedPaid[p.id] ? 'paid' : p.status;
    
    const matchesSearch = p.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.customer_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = statusFilter === 'all' || currentStatus === statusFilter;
    
    return matchesSearch && matchesFilter;
  });

  const getRiskColorPalette = (level) => {
    switch (level) {
      case 'CRITICAL':
        return { text: 'text-[#ef4444]', border: 'border-red-200', bg: 'bg-red-50', badge: 'bg-[#fee2e2] text-[#b91c1c]' };
      case 'HIGH':
        return { text: 'text-[#f97316]', border: 'border-orange-200', bg: 'bg-orange-50', badge: 'bg-[#ffedd5] text-[#c2410c]' };
      case 'MEDIUM':
        return { text: 'text-[#eab308]', border: 'border-yellow-200', bg: 'bg-yellow-50', badge: 'bg-[#fef9c3] text-[#a16207]' };
      default:
        return { text: 'text-[#10b981]', border: 'border-emerald-200', bg: 'bg-emerald-50', badge: 'bg-[#d1fae5] text-[#065f46]' };
    }
  };

  const riskStyles = summary ? getRiskColorPalette(summary.riskLevel) : getRiskColorPalette('LOW');

  // Sub-tab Render Methods

  // TAB 1: Main Dashboard
  const renderDashboardTab = () => (
    <>
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        
        {/* Total Overdue */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition hover:shadow-md flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Total Overdue Dues
            </span>
            <span className="text-2xl font-black text-[#d32f2f]">
              ₹{(summary?.totalOverdue || 0).toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-slate-400 block mt-2 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-[#d32f2f]" />
              Requires immediate smart followups
            </span>
          </div>
          <div className="p-2.5 bg-red-50 border border-red-100 text-[#d32f2f] rounded-lg">
            <AlertCircle className="h-5 w-5" />
          </div>
        </div>

        {/* Due in 30 Days */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition hover:shadow-md flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Receivables (Next 30 Days)
            </span>
            <span className="text-2xl font-black text-[#0066FF]">
              ₹{(summary?.totalDueNext30Days || 0).toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-slate-400 block mt-2 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-[#0066FF]" />
              Upcoming payment cycle invoices
            </span>
          </div>
          <div className="p-2.5 bg-blue-50 border border-blue-100 text-[#0066FF] rounded-lg">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        {/* Risk Analyzer Card */}
        <div className={`bg-white border ${riskStyles.border} rounded-xl p-5 shadow-sm transition hover:shadow-md flex flex-col justify-between`}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Cash-Flow Risk Analysis
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-2xl font-black ${riskStyles.text}`}>
                  {summary?.riskScore}%
                </span>
                <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider ${riskStyles.badge}`}>
                  {summary?.riskLevel}
                </span>
              </div>
            </div>
            <div className={`p-2.5 ${riskStyles.bg} border ${riskStyles.border} ${riskStyles.text} rounded-lg`}>
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-2.5">
            {summary?.explanation}
          </p>
        </div>

      </div>

      {/* Visual Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        
        {/* Forecast Area Chart */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                30-Day Accounts Receivable Cumulative Curve
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Visualizing collection progression schedules against outstanding balances.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0066FF]">
              <span className="h-2 w-2 rounded-full bg-[#0066FF]" />
              <span>Expected Cumulative Recoveries</span>
            </div>
          </div>

          <div className="h-64 w-full pr-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={getForecastChartData()}>
                <defs>
                  <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0066FF" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#0066FF" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" opacity={0.8} />
                <XAxis 
                  dataKey="dateLabel" 
                  stroke="#94a3b8" 
                  fontSize={9} 
                  tickLine={false} 
                />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={9} 
                  tickLine={false} 
                  tickFormatter={(v) => `₹${v/1000}k`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                  labelStyle={{ color: '#64748b', fontWeight: 'bold', fontSize: '10px' }}
                  itemStyle={{ color: '#0066FF', fontSize: '11px' }}
                  formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Expected Inflow']}
                />
                <Area 
                  type="monotone" 
                  dataKey="Cumulative Cash" 
                  stroke="#0066FF" 
                  strokeWidth={2.5}
                  fillOpacity={1} 
                  fill="url(#colorCash)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Collections Policy Drawer Overview */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">Collections Policy Levels</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Dynamic tone-escalation schedule configured for automated merchant followups:
            </p>

            <div className="space-y-3">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5">
                <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase mt-0.5 shrink-0">
                  Tier 1
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-700">0 - 3 Days Overdue</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Polite reminder nudge assuming a minor oversight. Retains strong relationship warm tone.</p>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5">
                <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-yellow-100 text-yellow-800 border border-yellow-200 uppercase mt-0.5 shrink-0">
                  Tier 2
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-700">4 - 10 Days Overdue</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Firm collection notice. Formal and direct request containing payment invoice link.</p>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5">
                <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-red-100 text-red-800 border border-red-200 uppercase mt-0.5 shrink-0">
                  Tier 3
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-700">10+ Days Overdue</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Urgent Final Notice. Direct warnings stating potential service suspension timelines.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center pt-3 border-t border-slate-100 mt-3">
            <span className="text-[9px] text-slate-400">
              Calculated automatically from Razorpay due dates.
            </span>
          </div>
        </div>

      </div>

      {/* Payments Ledger Grid */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        
        {/* Table search filter bar */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              Accounts Receivable Ledger Table
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Query, edit details, and trigger AI drafts for individual accounts.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={handleRunBulkAudit}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold active:scale-95 transition shrink-0 cursor-pointer shadow-sm border border-indigo-600"
            >
              <Bot className="h-4 w-4 animate-bounce" />
              Proactive Bulk AI Audit
            </button>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input 
                type="text"
                placeholder="Search name, description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:border-[#0066FF] transition text-slate-700"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-auto px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#0066FF] transition text-slate-600"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Status: Pending</option>
                <option value="overdue">Status: Overdue</option>
                <option value="paid">Status: Paid</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table ledger */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                <th className="py-3 px-5">Customer Account</th>
                <th className="py-3 px-5">Description</th>
                <th className="py-3 px-5">Due Date</th>
                <th className="py-3 px-5">Aging Timeline</th>
                <th className="py-3 px-5">Status</th>
                <th className="py-3 px-5 text-right">Action Gateway</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-400 font-medium">
                    No transaction records match selected parameters.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const isSimPaid = simulatedPaid[p.id];
                  const isSimSent = simulatedSent[p.id];
                  const status = isSimPaid ? 'paid' : p.status;
                  
                  // Age calculations
                  const today = new Date();
                  const todayStr = today.toISOString().split('T')[0];
                  let daysOverdueText = 'Upcoming';
                  let daysOverdue = 0;
                  
                  if (p.due_date < todayStr && status !== 'paid') {
                    const diff = Math.abs(today - new Date(p.due_date));
                    daysOverdue = Math.ceil(diff / (1000 * 60 * 60 * 24));
                    daysOverdueText = `${daysOverdue} days overdue`;
                  } else if (status === 'paid') {
                    daysOverdueText = 'Settled';
                  } else {
                    const diff = Math.abs(new Date(p.due_date) - today);
                    const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
                    daysOverdueText = `Due in ${daysLeft} days`;
                  }

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition">
                      
                      {/* Profile Details */}
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-blue-50 border border-blue-100 text-[#0066FF] flex items-center justify-center font-bold text-xs uppercase shrink-0">
                            {p.customer_name.split(' ').map(n=>n[0]).join('')}
                          </div>
                          <div>
                            <div className="font-bold text-slate-700">
                              {p.customer_name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {p.customer_email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Details & Amount */}
                      <td className="py-3 px-5">
                        <div className="font-semibold text-slate-800">
                          ₹{p.amount.toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-xs mt-0.5">
                          {p.description}
                        </div>
                      </td>

                      {/* Due Date */}
                      <td className="py-3 px-5 text-slate-600 font-medium">
                        {new Date(p.due_date).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>

                      {/* Aging Progress */}
                      <td className="py-3 px-5">
                        <span className={`text-[11px] font-medium flex items-center gap-1.5 ${
                          status === 'paid' ? 'text-emerald-600' : 
                          status === 'overdue' ? 'text-[#d32f2f]' : 'text-slate-500'
                        }`}>
                          {status === 'overdue' && <span className="h-1.5 w-1.5 rounded-full bg-[#d32f2f]" />}
                          {status === 'pending' && <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />}
                          {daysOverdueText}
                        </span>
                      </td>

                      {/* Status Pill Badge */}
                      <td className="py-3 px-5">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                          status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          status === 'overdue' ? 'bg-red-50 text-red-700 border-red-200' : 
                          'bg-yellow-50 text-yellow-700 border-yellow-200'
                        }`}>
                          {status}
                        </span>
                      </td>

                      {/* Actions Group */}
                      <td className="py-3 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {status !== 'paid' && (
                            <>
                              <button
                                onClick={() => handleGenerateReminder(p)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#0066FF] hover:bg-[#0052cc] text-white active:scale-95 text-[11px] font-semibold transition cursor-pointer"
                              >
                                <Bot className="h-3.5 w-3.5" />
                                AI Draft
                              </button>

                              <button
                                onClick={() => handleSimulateWebhook(p.id)}
                                disabled={simulatingWebhookId === p.id}
                                title="Simulates Razorpay payment_link.paid webhook event"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 active:scale-95 text-[11px] font-bold transition border border-emerald-300 cursor-pointer"
                              >
                                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                                {simulatingWebhookId === p.id ? 'Firing...' : '⚡ Webhook Pay'}
                              </button>
                            </>
                          )}
                          
                          {status === 'paid' && (
                            <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 py-1.5">
                              <CheckCircle2 className="h-4 w-4" /> Settled
                            </span>
                          )}

                          {isSimSent && status !== 'paid' && (
                            <span className="text-[9px] text-slate-400 font-semibold bg-slate-100 px-1.5 py-1 rounded border border-slate-200">
                              Nudge Sent
                            </span>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>
    </>
  );

  // TAB 2: Razorpay Links Page
  const renderRazorpayLinksTab = () => (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-800">Razorpay Payment Links Registry</h2>
          <p className="text-xs text-slate-400 mt-1">
            Simulate and interact with standard checkout URLs created dynamically on the sandbox ledger.
          </p>
        </div>
        <div className="flex gap-2">
          {rzpKeyId && (
            <button
              onClick={handleSyncPayments}
              disabled={syncing}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition shadow-sm active:scale-95 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Statuses'}
            </button>
          )}
          <button
            onClick={() => setCreateLinkModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-[#0066FF] text-white hover:bg-[#0052cc] transition shadow-sm active:scale-95 shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Create Payment Link
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              <th className="py-3 px-4">Link ID</th>
              <th className="py-3 px-4">Customer Name</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4">Amount (INR)</th>
              <th className="py-3 px-4">Due Date</th>
              <th className="py-3 px-4">Direct Link</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
            {payments.map(p => {
              const isSimPaid = simulatedPaid[p.id];
              const status = isSimPaid ? 'paid' : p.status;
              
              return (
                <tr key={p.id} className="hover:bg-slate-50/50 transition">
                  <td className="py-3 px-4 font-mono font-bold text-[#0066FF]">{p.id}</td>
                  <td className="py-3 px-4 font-semibold text-slate-700">{p.customer_name}</td>
                  <td className="py-3 px-4 max-w-xs truncate">{p.description || 'No description'}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">₹{p.amount.toLocaleString('en-IN')}</td>
                  <td className="py-3 px-4">{p.due_date}</td>
                  <td className="py-3 px-4">
                    <a 
                      href={p.short_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-[#0066FF] hover:underline flex items-center gap-1 font-medium font-mono text-[11px]"
                    >
                      {p.short_url.replace('https://', '')}
                      <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => copyToClipboard(p.short_url)}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-50 active:scale-95 transition hover:text-[#0066FF]"
                    >
                      Copy Link
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // TAB 3: Ledger Reports Page
  const renderLedgerReportsTab = () => {
    // Math indicators
    const totalPaymentsCount = payments.length;
    const settledPaymentsCount = payments.filter(p => simulatedPaid[p.id]).length;
    const pendingPaymentsCount = totalPaymentsCount - settledPaymentsCount;
    
    const overdueCount = payments.filter(p => {
      const todayStr = new Date().toISOString().split('T')[0];
      return p.due_date < todayStr && !simulatedPaid[p.id];
    }).length;
    
    const upcomingCount = pendingPaymentsCount - overdueCount;

    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Ledger Audits & Aging Analysis</h2>
            <p className="text-xs text-slate-400 mt-1">
              Download structural reports and analyze risk distributions for accounts receivable.
            </p>
          </div>
          <button
            onClick={handleExportLedgerCSV}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-[#0066FF] text-white hover:bg-[#0052cc] transition shadow-sm active:scale-95 shrink-0"
          >
            <Download className="h-4 w-4" />
            Export CSV Ledger
          </button>
        </div>

        {/* Health summary panel grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center">
            <span className="text-slate-400 text-xs block font-bold mb-1">Total Ledger Accounts</span>
            <span className="text-3xl font-black text-slate-800">{totalPaymentsCount}</span>
          </div>

          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg text-center">
            <span className="text-emerald-600 text-xs block font-bold mb-1">Settled Accounts</span>
            <span className="text-3xl font-black text-emerald-800">{settledPaymentsCount}</span>
          </div>

          <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-lg text-center">
            <span className="text-yellow-600 text-xs block font-bold mb-1">Upcoming Invoices</span>
            <span className="text-3xl font-black text-yellow-800">{upcomingCount}</span>
          </div>

          <div className="p-4 bg-red-50 border border-[#fee2e2] rounded-lg text-center">
            <span className="text-[#d32f2f] text-xs block font-bold mb-1">Overdue Accounts</span>
            <span className="text-3xl font-black text-[#d32f2f]">{overdueCount}</span>
          </div>
        </div>

        {/* Report visual meters */}
        <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-800 mb-4">Receivables Aging & Recovery Metrics</h3>
          
          <div className="space-y-4 max-w-xl">
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Collections Settlement Rate</span>
                <span className="font-bold">{totalPaymentsCount > 0 ? Math.round((settledPaymentsCount / totalPaymentsCount) * 100) : 0}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                  style={{ width: `${totalPaymentsCount > 0 ? (settledPaymentsCount / totalPaymentsCount) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Outstanding Overdue Ratio</span>
                <span className="font-bold text-[#d32f2f]">{totalPaymentsCount > 0 ? Math.round((overdueCount / totalPaymentsCount) * 100) : 0}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#d32f2f] rounded-full transition-all duration-500" 
                  style={{ width: `${totalPaymentsCount > 0 ? (overdueCount / totalPaymentsCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // TAB 4: AI Settings & API Keys Configuration Tab
  const renderAIConfigurationsTab = () => (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm max-w-2xl mx-auto">
      <div className="mb-6 pb-4 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-800">AI Integrations & API Credentials</h2>
        <p className="text-xs text-slate-400 mt-1">
          Dynamically configure your third-party SDK parameters. Keys are transmitted securely via API request headers.
        </p>
      </div>

      {configSavedAlert && (
        <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          Settings saved successfully to browser storage.
        </div>
      )}

      <form onSubmit={handleSaveConfigs} className="space-y-5">
        
        {/* Nvidia API Key Block */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Key className="h-3.5 w-3.5 text-slate-400" />
            NVIDIA NIM API Key
          </label>
          <input
            type={showKeys ? 'text' : 'password'}
            placeholder="nvapi-..."
            value={nvidiaApiKey}
            onChange={(e) => setNvidiaApiKey(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#0066FF] focus:ring-1 focus:ring-[#0066FF] transition text-slate-700"
          />
          <span className="text-[10px] text-slate-400 mt-1 block">
            Used to query the OpenAI-compatible completions endpoint. Defaults to mock templates if not configured.
          </span>
        </div>

        {/* Razorpay Sandbox credentials */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Razorpay Key ID
            </label>
            <input
              type={showKeys ? 'text' : 'password'}
              placeholder="rzp_test_..."
              value={rzpKeyId}
              onChange={(e) => setRzpKeyId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#0066FF] focus:ring-1 focus:ring-[#0066FF] transition text-slate-700"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Razorpay Key Secret
            </label>
            <input
              type={showKeys ? 'text' : 'password'}
              placeholder="••••••••••••••••"
              value={rzpKeySecret}
              onChange={(e) => setRzpKeySecret(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#0066FF] focus:ring-1 focus:ring-[#0066FF] transition text-slate-700"
            />
          </div>
        </div>

        {/* Gmail Dispatch Credentials */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Mail className="h-4 w-4 text-[#0066FF]" />
            <span>Gmail Auto-Dispatch (Nodemailer SMTP)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Your Gmail Address (Sender)
              </label>
              <input
                type="email"
                placeholder="yourname@gmail.com"
                value={gmailUser}
                onChange={(e) => setGmailUser(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#0066FF] transition text-slate-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Google 16-character App Password
              </label>
              <input
                type={showKeys ? 'text' : 'password'}
                placeholder="abcd efgh ijkl mnop"
                value={gmailAppPassword}
                onChange={(e) => setGmailAppPassword(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#0066FF] transition text-slate-700"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 leading-normal">
            To generate an App Password: Go to <strong>Google Account &gt; Security &gt; 2-Step Verification &gt; App Passwords</strong>. Enter it here to enable real one-click backend email dispatch!
          </p>
        </div>

        {/* Model selections */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
            NVIDIA NIM Chat Model
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#0066FF] transition text-slate-600"
          >
            <option value="meta/llama-3.2-11b-vision-instruct">meta/llama-3.2-11b-vision-instruct (Recommended)</option>
            <option value="meta/llama-3.2-90b-vision-instruct">meta/llama-3.2-90b-vision-instruct</option>
          </select>
        </div>

        {/* Show keys selection */}
        <div className="flex items-center gap-2 pt-2">
          <input
            id="showKeysChk"
            type="checkbox"
            checked={showKeys}
            onChange={(e) => setShowKeys(e.target.checked)}
            className="rounded border-slate-300 text-[#0066FF] focus:ring-[#0066FF]"
          />
          <label htmlFor="showKeysChk" className="text-xs text-slate-500 font-semibold cursor-pointer">
            Reveal API Keys and Secrets in plaintext
          </label>
        </div>

        {/* Save button block */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-[#0066FF]" />
            <span>Credentials stored locally in browser sandbox</span>
          </div>

          <button
            type="submit"
            className="px-4 py-2 text-xs font-bold rounded-lg bg-[#0066FF] text-white hover:bg-[#0052cc] transition shadow-sm active:scale-95 cursor-pointer"
          >
            Save Configurations
          </button>
        </div>
      </form>
    </div>
  );
  const renderTabContent = () => {
    switch (activeTab) {
      case 'links':
        return renderRazorpayLinksTab();
      case 'ledger':
        return renderLedgerReportsTab();
      case 'config':
        return renderAIConfigurationsTab();
      case 'dashboard':
      default:
        return renderDashboardTab();
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans antialiased">
      
      {/* Official Razorpay Top Bar Brand Header */}
      <header className="bg-[#0b1a30] text-white border-b border-slate-900 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative h-6 w-6 bg-[#0066FF] transform rotate-12 flex items-center justify-center rounded">
              <span className="text-white font-black text-xs transform -rotate-12">R</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-extrabold text-lg tracking-tight text-white">Razorpay</span>
              <span className="text-[11px] font-semibold text-indigo-300 uppercase tracking-widest px-2 py-0.5 bg-indigo-500/20 border border-indigo-500/20 rounded">
                CashFlow AI
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-slate-300 text-sm">
            <span className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              API Connect: Active
            </span>
            {rzpKeyId && (
              <button 
                onClick={handleSyncPayments} 
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0066FF] hover:bg-[#0052cc] text-white active:scale-95 text-xs font-bold transition shrink-0 cursor-pointer shadow-sm border border-[#0066FF]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Razorpay'}
              </button>
            )}
            <button onClick={() => fetchData(true)} disabled={refreshing} className="hover:text-white p-1.5 transition">
              <RefreshCw className={`h-4.5 w-4.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <Bell className="h-4.5 w-4.5 cursor-pointer hover:text-white transition" />
            <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs text-white border border-slate-600 cursor-pointer">
              S
            </div>
          </div>
        </div>
      </header>

      {/* Secondary Dashboard Navigation Tab Strip */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between">
          <div className="flex gap-6 h-full text-sm font-semibold text-slate-500">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`h-full flex items-center px-1 transition border-b-2 cursor-pointer ${
                activeTab === 'dashboard' ? 'text-[#0066FF] border-[#0066FF]' : 'border-transparent hover:text-slate-800'
              }`}
            >
              CashFlow Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('links')}
              className={`h-full flex items-center px-1 transition border-b-2 cursor-pointer ${
                activeTab === 'links' ? 'text-[#0066FF] border-[#0066FF]' : 'border-transparent hover:text-slate-800'
              }`}
            >
              Razorpay Links
            </button>
            <button 
              onClick={() => setActiveTab('ledger')}
              className={`h-full flex items-center px-1 transition border-b-2 cursor-pointer ${
                activeTab === 'ledger' ? 'text-[#0066FF] border-[#0066FF]' : 'border-transparent hover:text-slate-800'
              }`}
            >
              Ledger Reports
            </button>
            <button 
              onClick={() => setActiveTab('config')}
              className={`h-full flex items-center px-1 transition border-b-2 cursor-pointer ${
                activeTab === 'config' ? 'text-[#0066FF] border-[#0066FF]' : 'border-transparent hover:text-slate-800'
              }`}
            >
              AI Configurations
            </button>
          </div>
          
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
            <span>Merchant ID: <strong>MID_9X8B7C6</strong></span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Dynamic Alert for Razorpay Webhook Event */}
        {webhookAlert && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-bold flex items-center justify-between shadow-sm animate-bounce">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span>⚡ {webhookAlert}</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider bg-emerald-200/60 px-2 py-0.5 rounded text-emerald-800">
              Live Reconciled
            </span>
          </div>
        )}

        {/* Dynamic Alert for Create Payment Link success */}
        {createSuccessAlert && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-sm animate-pulse">
            <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>Success: Payment Link successfully added to ledger! Expected inflow updated.</span>
          </div>
        )}

        {/* Dynamic Alert for Sync status success */}
        {syncResult && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-xs font-semibold flex items-center gap-2 shadow-sm">
            <CheckCircle className="h-5 w-5 text-[#0066FF] shrink-0" />
            <span>Success: {syncResult}</span>
          </div>
        )}

        {/* Dynamic Alert for Email dispatch success */}
        {emailSuccessAlert && (
          <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-800 text-xs font-semibold flex items-center gap-2 shadow-sm">
            <CheckCircle className="h-5 w-5 text-indigo-600 shrink-0" />
            <span>{emailSuccessAlert}</span>
          </div>
        )}

        {/* Judge Skim Value Proposition Section - Flat/Premium Card Layout */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm flex flex-col md:flex-row items-center gap-5">
          <div className="flex-1">
            <span className="text-[10px] font-bold text-[#0066FF] tracking-wider uppercase bg-blue-50 border border-blue-100 px-2 py-0.5 rounded inline-block mb-2">
              Value Proposition for Judges
            </span>
            <p className="text-slate-700 text-[13px] leading-relaxed">
              <strong>The Cash-Flow Crunch:</strong> Small merchants and freelancers lose up to 30% of their annual revenue due to tracking oversights and delayed client payments. 
            </p>
            <p className="text-slate-700 text-[13px] leading-relaxed mt-1">
              <strong>Our Solution:</strong> CashFlow AI links directly with Razorpay Smart Collect payment links, projects dynamic cash trends over 30 days, and drafts tone-escalated Llama-3.1 alerts to automate outstanding collections.
            </p>
          </div>
          <div className="flex items-center gap-3 border-l border-slate-200 pl-6 shrink-0 h-full hidden md:flex">
            <div className="text-center">
              <span className="text-2xl font-black text-slate-800 block">₹1.0L</span>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Average Monthly Revenue</span>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-center">
              <span className="text-2xl font-black text-slate-800 block">{payments.length}</span>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Active Invoices</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-red-800">Connection Error</h4>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-[#0066FF] animate-spin" />
            <p className="text-sm text-slate-500 font-medium animate-pulse">Syncing ledger records with Razorpay API...</p>
          </div>
        ) : (
          renderTabContent()
        )}

      </div>

      {/* AI Reminder Drawer Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setModalOpen(false)}
          />

          <div className="relative bg-white border border-slate-200 w-full max-w-lg rounded-xl overflow-hidden shadow-xl p-5">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-[#0066FF]" />
                <h3 className="text-sm font-bold text-slate-800">
                  NVIDIA NIM AI Collections Draft
                </h3>
              </div>
              <button 
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-semibold hover:underline"
              >
                Close
              </button>
            </div>

            {/* Context Detail Strip */}
            {selectedPayment && (
              <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 p-3 rounded-lg mb-4 text-[11px] text-slate-600">
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-bold">Client</span>
                  <span className="font-bold text-slate-700">{selectedPayment.customer_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-bold">Overdue Inflows</span>
                  <span className="font-bold text-slate-700">₹{selectedPayment.amount.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-bold">Due Date</span>
                  <span className="font-bold text-slate-700">{selectedPayment.due_date}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-bold">Escalation Policy</span>
                  <span className="px-1.5 py-0.5 text-[8px] rounded bg-blue-50 text-[#0066FF] font-bold border border-blue-200 uppercase inline-block">
                    {selectedPayment.status === 'overdue' ? 'Escalated Nudge' : 'Friendly Reminder'}
                  </span>
                </div>
              </div>
            )}

            {/* Draft copy block */}
            <div className="mb-4">
              <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1.5">
                Edit Reminder Copy
              </label>

              {generatingReminder ? (
                <div className="w-full h-32 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center flex-col gap-2">
                  <div className="h-5 w-5 rounded-full border-2 border-slate-300 border-t-[#0066FF] animate-spin" />
                  <span className="text-[10px] text-slate-500 font-semibold animate-pulse">Running completions prompt...</span>
                </div>
              ) : (
                <textarea
                  value={reminderText}
                  onChange={(e) => setReminderText(e.target.value)}
                  className="w-full h-32 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-[#0066FF] focus:ring-1 focus:ring-[#0066FF] transition resize-none leading-relaxed"
                />
              )}
            </div>

            {/* Smart Settlement Options (Razorpay Dynamic Links) */}
            {!generatingReminder && reminderText && (
              <div className="mb-3.5 p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] uppercase font-extrabold text-[#0066FF] flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-[#0066FF]" />
                    ⚡ Smart Razorpay Settlements (Agentic Negotiation)
                  </span>
                  {generatingSettlement && (
                    <span className="text-[10px] text-[#0066FF] font-semibold animate-pulse">Generating dynamic link...</span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleGenerateSettlement('discount_2_percent')}
                    disabled={generatingSettlement || refiningReminder}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-white border border-blue-200 hover:border-blue-400 hover:bg-blue-50/50 text-[#0066FF] rounded-md text-[11px] font-bold transition active:scale-95 cursor-pointer shadow-2xs"
                  >
                    🏷️ 2% Quick-Pay Discount
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateSettlement('split_milestone_50_50')}
                    disabled={generatingSettlement || refiningReminder}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-white border border-blue-200 hover:border-blue-400 hover:bg-blue-50/50 text-[#0066FF] rounded-md text-[11px] font-bold transition active:scale-95 cursor-pointer shadow-2xs"
                  >
                    ✂️ 50/50 Milestone Split
                  </button>
                </div>
              </div>
            )}

            {/* AI Refinement Input */}
            {!generatingReminder && reminderText && (
              <div className="mb-4 p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg">
                <label className="text-[9px] uppercase font-extrabold text-indigo-600 block mb-1.5 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-indigo-500 animate-pulse" />
                  Interactive AI Refinement
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 'make it shorter', 'be more polite'..."
                    value={refinementInput}
                    onChange={(e) => setRefinementInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleRefineReminder();
                      }
                    }}
                    disabled={refiningReminder}
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 transition text-slate-700 disabled:opacity-60"
                  />
                  <button
                    onClick={handleRefineReminder}
                    disabled={refiningReminder || !refinementInput.trim()}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-bold disabled:opacity-50 active:scale-95 transition shrink-0 cursor-pointer shadow-sm"
                  >
                    {refiningReminder ? 'Refining...' : 'Refine'}
                  </button>
                </div>
              </div>
            )}

            {/* Action buttons bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="text-[10px] text-slate-400">
                Ensure message content details are correct before sending.
              </div>
              
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => copyToClipboard()}
                  disabled={generatingReminder || !reminderText || refiningReminder}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95 transition w-full sm:w-auto cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy Draft
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    handleMarkAsSent(selectedPayment.id);
                    setModalOpen(false);
                  }}
                  disabled={generatingReminder || !reminderText || refiningReminder}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 transition w-full sm:w-auto cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5 text-slate-500" />
                  Mark Sent
                </button>

                <button
                  onClick={handleSendEmail}
                  disabled={generatingReminder || !reminderText || refiningReminder || sendingEmail}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#0066FF] text-white hover:bg-[#0052cc] active:scale-95 transition w-full sm:w-auto cursor-pointer disabled:opacity-50"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {sendingEmail ? 'Sending...' : 'Send Email'}
                </button>
              </div>
            </div>

            {/* Platform Channels */}
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-around text-slate-500 text-[11px] font-semibold gap-2 flex-wrap">
              <a 
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(reminderText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-emerald-600 cursor-pointer transition"
              >
                <MessageSquare className="h-4 w-4 text-emerald-500" /> WhatsApp
              </a>
              <a 
                href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(selectedPayment?.customer_email || '')}&su=${encodeURIComponent("Invoice Payment Reminder - " + (selectedPayment?.id || ''))}&body=${encodeURIComponent(reminderText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-red-600 cursor-pointer transition text-red-600"
              >
                <Mail className="h-4 w-4 text-red-500" /> Open in Gmail
              </a>
              <a 
                href={`mailto:${selectedPayment?.customer_email}?subject=${encodeURIComponent("Invoice Payment Reminder - " + (selectedPayment?.id || ''))}&body=${encodeURIComponent(reminderText)}`}
                className="flex items-center gap-1.5 hover:text-blue-600 cursor-pointer transition"
              >
                <Mail className="h-4 w-4 text-blue-500" /> Default Mail
              </a>
              <a 
                href={selectedPayment?.short_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-orange-600 cursor-pointer transition"
              >
                <ExternalLink className="h-4 w-4 text-orange-500" /> Pay Checkout
              </a>
            </div>

          </div>
        </div>
      )}

      {/* PROACTIVE BULK AI AUDIT MODAL */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setBulkModalOpen(false)}
          />

          <div className="relative bg-white border border-slate-200 w-full max-w-2xl rounded-xl overflow-hidden shadow-xl p-6 flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-indigo-600 animate-pulse" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Proactive AI Collections Agent Report
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Llama-3.1 bulk receivables analysis and tone-escalated actions.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setBulkModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-semibold hover:underline"
              >
                Close Report
              </button>
            </div>

            {loadingBulk ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
                <div className="h-10 w-10 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
                <p className="text-xs text-indigo-600 font-semibold animate-pulse text-center">
                  Proactive collections copilot scanning ledger risk indices...
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                
                {/* Executive Summary */}
                {bulkSummary && (
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-800 text-xs font-semibold leading-relaxed">
                    {bulkSummary}
                  </div>
                )}

                {/* Recommendations Deck */}
                <div className="space-y-3">
                  {bulkRecommendations.map((rec) => {
                    const payment = payments.find(p => p.id === rec.paymentId);
                    
                    return (
                      <div key={rec.paymentId} className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition hover:bg-slate-50/80">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 text-xs">{rec.clientName}</span>
                            <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded uppercase tracking-wider ${
                              rec.tier.toLowerCase().includes('3') ? 'bg-red-100 text-red-700 border border-red-200' :
                              rec.tier.toLowerCase().includes('2') ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                              'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            }`}>
                              {rec.tier}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">({rec.paymentId})</span>
                          </div>
                          
                          <p className="text-xs text-slate-600 italic bg-white p-2.5 rounded border border-slate-200 leading-relaxed font-sans select-all">
                            {rec.actionDraft}
                          </p>
                        </div>

                        {/* Action deck */}
                        <div className="flex flex-row md:flex-col gap-2 shrink-0 w-full md:w-auto justify-end border-t md:border-t-0 border-slate-200/60 pt-2.5 md:pt-0">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(rec.actionDraft);
                              alert('Draft copied successfully!');
                            }}
                            className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded text-[11px] font-bold transition flex-1 md:flex-none cursor-pointer"
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </button>
                          <a
                            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(rec.actionDraft)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-[11px] font-bold transition flex-1 md:flex-none cursor-pointer"
                          >
                            <MessageSquare className="h-3 w-3" /> WhatsApp
                          </a>
                          <a
                            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(payment?.customer_email || '')}&su=${encodeURIComponent("Payment Overdue Reminder - " + rec.paymentId)}&body=${encodeURIComponent(rec.actionDraft)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-[11px] font-bold transition flex-1 md:flex-none cursor-pointer"
                          >
                            <Mail className="h-3 w-3" /> Gmail
                          </a>
                          <a
                            href={`mailto:${payment?.customer_email}?subject=${encodeURIComponent("Payment Overdue Reminder - " + rec.paymentId)}&body=${encodeURIComponent(rec.actionDraft)}`}
                            className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-[11px] font-bold transition flex-1 md:flex-none cursor-pointer"
                          >
                            <Mail className="h-3 w-3" /> Mail App
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-200 shrink-0 text-center text-[10px] text-slate-400 leading-relaxed">
              Verify outstanding invoices with the ledger table. In sandbox mode checkout link will route payments locally.
            </div>

          </div>
        </div>
      )}

      {/* CREATE PAYMENT LINK OVERLAY MODAL */}
      {createLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setCreateLinkModalOpen(false)}
          />

          <div className="relative bg-white border border-slate-200 w-full max-w-md rounded-xl overflow-hidden shadow-xl p-5">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-[#0066FF]" />
                <h3 className="text-sm font-bold text-slate-800">
                  Create Razorpay Payment Link
                </h3>
              </div>
              <button 
                onClick={() => setCreateLinkModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-semibold hover:underline"
              >
                Close
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreatePaymentLink} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Priyesh Patel"
                  value={newPayment.customer_name}
                  onChange={(e) => setNewPayment(prev => ({ ...prev, customer_name: e.target.value }))}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs focus:outline-none focus:border-[#0066FF] transition text-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Customer Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. priyesh.patel@example.com"
                  value={newPayment.customer_email}
                  onChange={(e) => setNewPayment(prev => ({ ...prev, customer_email: e.target.value }))}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs focus:outline-none focus:border-[#0066FF] transition text-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Amount (INR) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 5000"
                    value={newPayment.amount}
                    onChange={(e) => setNewPayment(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs focus:outline-none focus:border-[#0066FF] transition text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Due Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newPayment.due_date}
                    onChange={(e) => setNewPayment(prev => ({ ...prev, due_date: e.target.value }))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs focus:outline-none focus:border-[#0066FF] transition text-slate-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Link Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Invoicing details for freelance design work"
                  value={newPayment.description}
                  onChange={(e) => setNewPayment(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs focus:outline-none focus:border-[#0066FF] transition text-slate-700"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateLinkModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 transition active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPayment}
                  className="px-4 py-1.5 text-xs font-bold rounded bg-[#0066FF] hover:bg-[#0052cc] text-white transition active:scale-95 shadow-sm disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                >
                  {submittingPayment ? (
                    <>
                      <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Generate Link'
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}

export default App;
