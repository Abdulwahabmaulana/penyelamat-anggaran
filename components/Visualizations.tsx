
import React, { useState, useMemo, useEffect } from 'react';
import { 
    Treemap, Tooltip, Legend, ResponsiveContainer, 
    BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid 
} from 'recharts';
import type { AppState, Budget, GlobalTransaction } from '../types';
import { LightbulbIcon, SparklesIcon, LockClosedIcon, ShieldCheckIcon, BuildingLibraryIcon, BanknotesIcon, Squares2x2Icon, ExclamationTriangleIcon, ArrowUturnLeftIcon } from './Icons';
import { AISkeleton } from './UI';

interface VisualizationsProps {
    state: AppState;
    onBack: () => void;
    onAnalyzeChart: (prompt: string) => Promise<string>;
    activePersona?: string;
    hasApiKey: boolean;
}

const formatCurrency = (amount: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
const formatShortCurrency = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} Jt`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)} rb`;
    return amount;
};

const COLORS = ['#2C3E50', '#1ABC9C', '#F1C40F', '#E74C3C', '#3498DB', '#9B59B6', '#E67E22', '#7F8C8D', '#16A085', '#2980B9'];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        // Handle Treemap payload structure which is slightly different
        const data = payload[0].payload;
        const name = data.name || label;
        const value = data.size !== undefined ? data.size : data.value;
        const color = data.fill || payload[0].color;

        return (
            <div className="bg-white p-3 border border-gray-300 rounded shadow-lg z-50 relative">
                <p className="font-semibold mb-1 text-dark-text">{name}</p>
                <p style={{ color: color }}>
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
    const { x, y, width, height, name, size, fill, onClick } = props;
    
    // Logic to determine font size based on box size
    const fontSize = Math.min(width / 5, height / 3, 14);
    const showText = width > 40 && height > 30;

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
                <text
                    x={x + width / 2}
                    y={y + height / 2}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={fontSize}
                    fontWeight="bold"
                    dy={-fontSize/2}
                >
                    {name}
                </text>
            )}
             {showText && (
                <text
                    x={x + width / 2}
                    y={y + height / 2}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={fontSize * 0.8}
                    dy={fontSize}
                >
                    {formatShortCurrency(size)}
                </text>
            )}
        </g>
    );
};

const Visualizations: React.FC<VisualizationsProps> = ({ state, onBack, onAnalyzeChart, activePersona, hasApiKey }) => {
    const [chartType, setChartType] = useState<'treemap' | 'bar' | 'area'>('treemap');
    const [analysis, setAnalysis] = useState<string>('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const treemapData = useMemo(() => {
        return state.budgets
            .filter(b => !b.isArchived)
            .map((b, index) => {
                const used = b.history.reduce((sum, h) => sum + h.amount, 0);
                return {
                    name: b.name,
                    size: used,
                    fill: COLORS[index % COLORS.length]
                };
            })
            .filter(item => item.size > 0)
            .sort((a, b) => b.size - a.size);
    }, [state.budgets]);

    const barData = useMemo(() => {
        return state.budgets
            .filter(b => !b.isArchived)
            .map(b => ({
                name: b.name,
                terpakai: b.history.reduce((sum, h) => sum + h.amount, 0),
                budget: b.totalBudget
            }))
            .filter(b => b.budget > 0);
    }, [state.budgets]);

    const areaData = useMemo(() => {
        // Aggregate expenses by date for the current month
        const data: {[key: string]: number} = {};
        state.dailyExpenses.forEach(t => {
            const date = new Date(t.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            data[date] = (data[date] || 0) + t.amount;
        });
        state.budgets.forEach(b => {
            b.history.forEach(t => {
                const date = new Date(t.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                data[date] = (data[date] || 0) + t.amount;
            });
        });
        
        return Object.entries(data)
            .map(([name, value]) => ({ name, value }))
    }, [state]);

    const handleAIAnalysis = async () => {
        setIsAnalyzing(true);
        setAnalysis('');
        
        let dataContext = '';
        let prompt = '';

        if (chartType === 'treemap') {
            dataContext = JSON.stringify(treemapData);
            prompt = `Analisis distribusi pengeluaran ini (Treemap Data): ${dataContext}. Apa kategori yang paling membebani?`;
        } else if (chartType === 'bar') {
            dataContext = JSON.stringify(barData);
            prompt = `Analisis perbandingan anggaran vs realisasi ini (Bar Chart Data): ${dataContext}. Mana yang overbudget atau efisien?`;
        } else {
            dataContext = JSON.stringify(areaData);
            prompt = `Analisis tren pengeluaran harian ini (Area Chart Data): ${dataContext}. Apakah ada pola lonjakan?`;
        }

        const result = await onAnalyzeChart(prompt);
        setAnalysis(result);
        setIsAnalyzing(false);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col p-4 pb-24">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-100">
                    <ArrowUturnLeftIcon className="w-5 h-5 text-primary-navy" />
                </button>
                <h1 className="text-2xl font-bold text-primary-navy">Visualisasi Data</h1>
            </div>

            <div className="mb-6">
                <SegmentedControl 
                    options={[
                        { label: 'Distribusi', value: 'treemap' },
                        { label: 'Anggaran', value: 'bar' },
                        { label: 'Tren', value: 'area' }
                    ]}
                    value={chartType}
                    onChange={setChartType}
                />
            </div>

            <div className="flex-grow bg-white rounded-2xl shadow-md p-4 border border-gray-100 relative min-h-[400px] flex flex-col">
                {chartType === 'treemap' && (
                    treemapData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <Treemap
                                data={treemapData}
                                dataKey="size"
                                aspectRatio={4 / 3}
                                stroke="#fff"
                                content={<CustomizedTreemapContent />}
                            >
                                <Tooltip content={<CustomTooltip />} />
                            </Treemap>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400">Belum ada data pengeluaran.</div>
                    )
                )}

                {chartType === 'bar' && (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" fontSize={10} />
                            <YAxis fontSize={10} tickFormatter={(val) => `${val/1000}k`} />
                            <Tooltip cursor={{fill: 'transparent'}} content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="budget" name="Anggaran" fill="#E0E0E0" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="terpakai" name="Terpakai" fill="#1ABC9C" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}

                {chartType === 'area' && (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={areaData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3498DB" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#3498DB" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="name" fontSize={10} />
                            <YAxis fontSize={10} tickFormatter={(val) => `${val/1000}k`} />
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="value" stroke="#3498DB" fillOpacity={1} fill="url(#colorVal)" />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* AI Analysis Section */}
            <div className="mt-6 bg-white rounded-xl shadow-sm border border-indigo-100 p-4">
                <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-bold text-indigo-900">Analisis AI</h3>
                    </div>
                    <button 
                        onClick={handleAIAnalysis}
                        disabled={isAnalyzing || !hasApiKey}
                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-bold flex items-center gap-1"
                    >
                        {isAnalyzing ? 'Menganalisis...' : 'Analisis Grafik'}
                        {!hasApiKey && <LockClosedIcon className="w-3 h-3" />}
                    </button>
                </div>
                
                {isAnalyzing ? (
                    <AISkeleton />
                ) : (
                    <div className="text-sm text-secondary-gray leading-relaxed">
                        {analysis ? (
                            analysis
                        ) : (
                            hasApiKey ? "Klik tombol untuk meminta AI membaca grafik ini dan memberikan wawasan." : "Fitur ini memerlukan API Key."
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Visualizations;
