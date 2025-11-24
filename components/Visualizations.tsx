
import React, { useState, useMemo, useEffect } from 'react';
import { 
    Treemap, Tooltip, Legend, ResponsiveContainer, 
    BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Cell
} from 'recharts';
import type { AppState, Budget, GlobalTransaction } from '../types';
import { LightbulbIcon, SparklesIcon, LockClosedIcon, ShieldCheckIcon, BuildingLibraryIcon, BanknotesIcon, Squares2x2Icon, ExclamationTriangleIcon, ArrowUturnLeftIcon, ArrowTrendingUpIcon, ArrowPathIcon } from './Icons';
import { AISkeleton } from './UI';

interface VisualizationsProps {
    state: AppState;
    onBack: () => void;
    onAnalyzeChart: (prompt: string) => Promise<string>;
    activePersona?: string;
    hasApiKey: boolean;
}

const formatCurrency = (amount: number) => {
    if (Math.abs(amount) >= 1e11) {
        return amount.toExponential(2);
    }
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
};
const formatShortCurrency = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} Jt`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)} rb`;
    return amount;
};

const COLORS = ['#2C3E50', '#1ABC9C', '#F1C40F', '#E74C3C', '#3498DB', '#9B59B6', '#E67E22', '#7F8C8D', '#16A085', '#2980B9'];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        // Handle diverse data structures (Treemap vs Bar/Area)
        const name = data.name || label || (data.payload && data.payload.name);
        const value = data.value !== undefined ? data.value : (data.size !== undefined ? data.size : 0);
        const color = data.fill || payload[0].color;

        return (
            <div className="bg-white p-3 border border-gray-300 rounded shadow-lg z-50 relative">
                <p className="font-semibold mb-1 text-dark-text text-sm">{name}</p>
                <p className="font-bold" style={{ color: color }}>
                    {formatCurrency(value)}
                </p>
            </div>
        );
    }
    return null;
};

// --- CUSTOM COMPONENTS ---

const SegmentedControl: React.FC<{
    options: { label: string; value: string }[];
    value: string;
    onChange: (val: any) => void;
}> = ({ options, value, onChange }) => {
    const activeIndex = options.findIndex(o => o.value === value);
    
    return (
        <div className="relative bg-gray-200 p-1 rounded-xl flex items-center font-medium shadow-inner">
            {/* Sliding Background */}
            <div 
                className="absolute bg-white rounded-lg shadow-sm h-[calc(100%-8px)] transition-all duration-300 ease-out"
                style={{
                    width: `${100 / options.length}%`,
                    left: `${(activeIndex * 100) / options.length}%`,
                }}
            />
            {options.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    className={`relative flex-1 py-2 text-xs sm:text-sm text-center z-10 transition-colors duration-300 ${value === opt.value ? 'text-primary-navy font-bold' : 'text-secondary-gray hover:text-gray-600'}`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
};

const CustomizedTreemapContent = (props: any) => {
    const { x, y, width, height, name, size, fill } = props;
    
    // Safety check for invalid dimensions
    if (!width || !height || width <= 0 || height <= 0) return null;

    // Logic to determine font size based on box size
    const fontSize = Math.min(width / 5, height / 4, 14);
    const showText = width > 50 && height > 40;

    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                style={{
                    fill: fill,
                    stroke: '#fff',
                    strokeWidth: 2,
                }}
            />
            {showText && (
                <>
                    <text
                        x={x + width / 2}
                        y={y + height / 2 - fontSize / 2}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize={fontSize}
                        fontWeight="bold"
                        pointerEvents="none"
                    >
                        {name}
                    </text>
                    <text
                        x={x + width / 2}
                        y={y + height / 2 + fontSize}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize={fontSize * 0.85}
                        pointerEvents="none"
                    >
                        {formatShortCurrency(size)}
                    </text>
                </>
            )}
        </g>
    );
};

const Visualizations: React.FC<VisualizationsProps> = ({ state, onBack, onAnalyzeChart, activePersona, hasApiKey }) => {
    const [chartType, setChartType] = useState<'allocation' | 'spending_trend' | 'income_vs_expense'>('allocation');
    const [aiAnalysis, setAiAnalysis] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Prepare Data: Allocation (Treemap)
    const allocationData = useMemo(() => {
        const data: any[] = [];
        // Budgets
        state.budgets.filter(b => !b.isArchived).forEach(b => {
            const used = b.history.reduce((sum, h) => sum + h.amount, 0);
            if(used > 0) {
                data.push({ name: b.name, size: used, fill: b.color || COLORS[0] });
            }
        });
        // Daily Expenses
        const dailyTotal = state.dailyExpenses.reduce((sum, t) => sum + t.amount, 0);
        if (dailyTotal > 0) {
            data.push({ name: 'Harian', size: dailyTotal, fill: COLORS[1] });
        }
        // General Funds Expense
        const generalTotal = state.fundHistory.filter(t => t.type === 'remove').reduce((sum, t) => sum + t.amount, 0);
        if (generalTotal > 0) {
            data.push({ name: 'Dana Umum', size: generalTotal, fill: COLORS[2] });
        }
        return data.sort((a,b) => b.size - a.size);
    }, [state]);

    // Prepare Data: Spending Trend (Area)
    const trendData = useMemo(() => {
        const map: {[date: string]: number} = {};
        const allTx = [
            ...state.dailyExpenses,
            ...state.fundHistory.filter(t => t.type === 'remove'),
            ...state.budgets.flatMap(b => b.history)
        ];
        allTx.forEach(t => {
            const d = new Date(t.timestamp).toLocaleDateString('fr-CA');
            map[d] = (map[d] || 0) + t.amount;
        });
        return Object.keys(map).sort().map(date => ({
            name: new Date(date).getDate().toString(),
            value: map[date]
        })).slice(-14); // Last 14 active days
    }, [state]);

    // Prepare Data: Income vs Expense (Bar)
    const comparisonData = useMemo(() => {
        const income = state.fundHistory.filter(t => t.type === 'add').reduce((sum, t) => sum + t.amount, 0);
        const expense = allocationData.reduce((sum, d) => sum + d.size, 0);
        return [
            { name: 'Pemasukan', value: income, fill: '#1ABC9C' },
            { name: 'Pengeluaran', value: expense, fill: '#E74C3C' }
        ];
    }, [state, allocationData]);

    const handleAIAnalysis = async () => {
        if (!hasApiKey) return;
        setIsAnalyzing(true);
        setAiAnalysis('');
        
        let promptData = "";
        if (chartType === 'allocation') {
            promptData = `Data Alokasi Pengeluaran: ${JSON.stringify(allocationData.map(d => `${d.name}: ${formatCurrency(d.size)}`))}`;
        } else if (chartType === 'spending_trend') {
            promptData = `Tren Pengeluaran Harian (14 hari terakhir): ${JSON.stringify(trendData)}`;
        } else {
            promptData = `Perbandingan Pemasukan vs Pengeluaran: ${JSON.stringify(comparisonData.map(d => `${d.name}: ${formatCurrency(d.value)}`))}`;
        }

        const result = await onAnalyzeChart(`Analisis grafik ini (${chartType}). ${promptData}. Berikan insight singkat dan tajam.`);
        setAiAnalysis(result);
        setIsAnalyzing(false);
    };

    // Trigger analysis when chart type changes if already analyzing or on demand
    useEffect(() => {
        setAiAnalysis('');
        // Optional: Auto analyze on switch? No, save tokens. User clicks.
    }, [chartType]);

    return (
        <div className="h-screen flex flex-col bg-gray-50 pb-20 overflow-hidden">
            {/* Header */}
            <header className="bg-white p-4 shadow-sm z-10 flex items-center justify-between">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 text-secondary-gray">
                    <ArrowUturnLeftIcon className="w-6 h-6" />
                </button>
                <h1 className="text-xl font-bold text-primary-navy">Visualisasi Data</h1>
                <div className="w-10"></div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Chart Selector */}
                <SegmentedControl 
                    options={[
                        { label: 'Alokasi', value: 'allocation' },
                        { label: 'Tren', value: 'spending_trend' },
                        { label: 'Arus Kas', value: 'income_vs_expense' }
                    ]}
                    value={chartType}
                    onChange={(val) => setChartType(val)}
                />

                {/* Chart Container */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 h-96 relative">
                    {chartType === 'allocation' && (
                        allocationData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <Treemap
                                    data={allocationData}
                                    dataKey="size"
                                    aspectRatio={4 / 3}
                                    stroke="#fff"
                                    content={<CustomizedTreemapContent />}
                                >
                                    <Tooltip content={<CustomTooltip />} />
                                </Treemap>
                            </ResponsiveContainer>
                        ) : <div className="h-full flex items-center justify-center text-gray-400">Belum ada data pengeluaran.</div>
                    )}

                    {chartType === 'spending_trend' && (
                        trendData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendData}>
                                    <defs>
                                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3498DB" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#3498DB" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" tick={{fontSize: 10}} />
                                    <YAxis tick={{fontSize: 10}} width={40} tickFormatter={(val) => val >= 1000 ? `${val/1000}k` : val} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="value" stroke="#3498DB" fillOpacity={1} fill="url(#colorValue)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : <div className="h-full flex items-center justify-center text-gray-400">Belum ada tren data.</div>
                    )}

                    {chartType === 'income_vs_expense' && (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={comparisonData} barSize={60}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{fontSize: 12}} />
                                <YAxis tick={{fontSize: 10}} width={40} tickFormatter={(val) => val >= 1000 ? `${val/1000}k` : val} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                                    {comparisonData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* AI Analysis Section */}
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-5 rounded-2xl border border-indigo-100 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                            <div className="bg-white p-1.5 rounded-lg shadow-sm">
                                <SparklesIcon className="w-5 h-5 text-purple-600" />
                            </div>
                            <h3 className="font-bold text-primary-navy">Analisis Grafik AI</h3>
                        </div>
                        {hasApiKey ? (
                            <button 
                                onClick={handleAIAnalysis}
                                disabled={isAnalyzing}
                                className="text-xs font-bold bg-white text-indigo-600 px-3 py-1.5 rounded-full shadow-sm hover:bg-indigo-50 transition-colors flex items-center gap-1 disabled:opacity-50"
                            >
                                {isAnalyzing ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : <LightbulbIcon className="w-3 h-3" />}
                                {isAnalyzing ? 'Menganalisa...' : 'Analisis'}
                            </button>
                        ) : (
                            <div className="text-xs font-bold bg-gray-200 text-gray-500 px-3 py-1.5 rounded-full flex items-center gap-1">
                                <LockClosedIcon className="w-3 h-3" /> Terkunci
                            </div>
                        )}
                    </div>
                    
                    {isAnalyzing ? (
                        <AISkeleton />
                    ) : aiAnalysis ? (
                        <div className="text-sm text-secondary-gray leading-relaxed animate-fade-in">
                            {aiAnalysis}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 italic">
                            Klik tombol analisis untuk mendapatkan wawasan mendalam tentang grafik di atas.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Visualizations;
