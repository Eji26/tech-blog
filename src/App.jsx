import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Search, Moon, Sun, Bookmark, Home, LayoutDashboard, LogOut, Link as LinkIcon,
    Trash2, Edit, Plus, X, Loader2, CheckCircle, AlertCircle, Youtube, ListVideo,
    Github, FileText, Globe, Box, Filter, Download, Upload, Clock
} from 'lucide-react';
import { db } from './firebase';
import {
    collection, addDoc, onSnapshot, query, orderBy,
    deleteDoc, doc, updateDoc, getDocs, writeBatch
} from 'firebase/firestore';

// --- INITIAL DATA & CONSTANTS ---
const CATEGORIES = [
    "AI & Machine Learning", "Web Development", "DevOps & Cloud",
    "Data Science", "Cybersecurity", "Programming Languages",
    "Tools & Productivity", "Open Source", "Tutorials & Courses",
    "Research & Papers", "Other"
];

const TYPES = ["youtube", "playlist", "github", "document", "website", "other"];

const TYPE_ICONS = {
    youtube: <Youtube className="w-4 h-4" />,
    playlist: <ListVideo className="w-4 h-4" />,
    github: <Github className="w-4 h-4" />,
    document: <FileText className="w-4 h-4" />,
    website: <Globe className="w-4 h-4" />,
    other: <Box className="w-4 h-4" />
};

// --- HELPERS ---
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15);
};

const formatDate = (isoString) => {
    if (!isoString) return "";
    return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    }).format(new Date(isoString));
};

const isNew = (isoString) => {
    if (!isoString) return false;
    const added = new Date(isoString);
    const now = new Date();
    const diffTime = Math.abs(now - added);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
};

// Safe LocalStorage Wrappers
const lsGet = (key, fallback) => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch (e) {
        return fallback;
    }
};

const lsSet = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error(`Error saving ${key} to localStorage`, e);
    }
};

// --- APP COMPONENT ---
export default function App() {
    // Global State
    const [route, setRoute] = useState('home'); // 'home', 'admin-login', 'admin-dashboard'
    const [darkMode, setDarkMode] = useState(() => lsGet('techblog_darkmode', false));
    const [resources, setResources] = useState([]);
    const [bookmarks, setBookmarks] = useState(() => lsGet('techblog_bookmarks', []));
    const [auth, setAuth] = useState(() => lsGet('techblog_auth', null));

    // Sync dark mode
    useEffect(() => {
        lsSet('techblog_darkmode', darkMode);
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    // Real-time sync from Firestore
    useEffect(() => {
        console.log("Setting up resilient Firestore sync...");
        const q = collection(db, "resources");
        const unsubscribe = onSnapshot(q, (snapshot) => {
            console.log(`Firestore snapshot received at ${new Date().toLocaleTimeString()}: ${snapshot.size} docs`);
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            setResources(prev => {
                const sortedData = data.sort((a, b) => {
                    const dateA = a.addedAt ? new Date(a.addedAt) : new Date(0);
                    const dateB = b.addedAt ? new Date(b.addedAt) : new Date(0);
                    return dateB - dateA;
                });
                console.log("State updated with sorted data:", sortedData.length, "items");
                return [...sortedData]; // Ensure new array reference
            });
        }, (error) => {
            console.error("Firestore sync error:", error);
        });
        return () => unsubscribe();
    }, []);

    // One-time migration from LocalStorage to Firestore
    useEffect(() => {
        const migrate = async () => {
            const localData = lsGet('techblog_resources', []);
            console.log(`Checking migration. Local items: ${localData.length}`);
            if (localData.length > 0) {
                const snapshot = await getDocs(collection(db, "resources"));
                console.log(`Firestore is empty? ${snapshot.empty}`);
                if (snapshot.empty) {
                    console.log("Migrating local resources to Firestore...");
                    const batch = writeBatch(db);
                    localData.forEach(res => {
                        const newDocRef = doc(collection(db, "resources"));
                        const { id, ...data } = res;
                        // Ensure required fields for persistence/sorting exist
                        const enrichedData = {
                            ...data,
                            addedAt: data.addedAt || new Date().toISOString(),
                            addedBy: data.addedBy || 'admin'
                        };
                        batch.set(newDocRef, enrichedData);
                    });
                    await batch.commit();
                    localStorage.removeItem('techblog_resources');
                    console.log("Migration complete. Local storage cleared.");
                } else {
                    console.log("Firestore not empty, skipping migration and clearing local storage.");
                    localStorage.removeItem('techblog_resources');
                }
            }
        };
        migrate();
    }, []);

    useEffect(() => {
        lsSet('techblog_bookmarks', bookmarks);
    }, [bookmarks]);

    useEffect(() => {
        if (auth) {
            lsSet('techblog_auth', auth);
        } else {
            localStorage.removeItem('techblog_auth');
        }
    }, [auth]);

    // Routing setup
    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash.replace('#', '') || '/';
            if (hash.startsWith('/admin')) {
                setRoute(auth ? 'admin-dashboard' : 'admin-login');
            } else {
                setRoute('home');
            }
        };
        window.addEventListener('hashchange', handleHashChange);
        handleHashChange(); // Init
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [auth]);

    const navigate = (path) => {
        window.location.hash = path;
    };

    // --- VIEWS ---
    if (route === 'home') {
        return (
            <HomeView
                resources={resources}
                bookmarks={bookmarks}
                setBookmarks={setBookmarks}
                darkMode={darkMode}
                toggleDarkMode={() => setDarkMode(!darkMode)}
                navigate={navigate}
            />
        );
    }

    if (route === 'admin-login') {
        return <AdminLogin setAuth={setAuth} navigate={navigate} darkMode={darkMode} />;
    }

    if (route === 'admin-dashboard') {
        return (
            <AdminDashboard
                resources={resources}
                setResources={setResources}
                setAuth={setAuth}
                navigate={navigate}
                darkMode={darkMode}
                toggleDarkMode={() => setDarkMode(!darkMode)}
            />
        );
    }

    return <div>Loading...</div>;
}

// --- HOME VIEW ---
function HomeView({ resources, bookmarks, setBookmarks, darkMode, toggleDarkMode, navigate }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedTypes, setSelectedTypes] = useState([]);
    const [viewMode, setViewMode] = useState('all'); // 'all' or 'bookmarked'
    const [sortBy, setSortBy] = useState('latest'); // 'latest', 'oldest', 'az'
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Derived State
    const filteredResources = useMemo(() => {
        let result = resources;

        // View Mode filter
        if (viewMode === 'bookmarked') {
            result = result.filter(r => bookmarks.includes(r.id));
        }

        // Search filter
        if (searchQuery.trim() !== '') {
            const q = searchQuery.toLowerCase();
            result = result.filter(r =>
                r.title?.toLowerCase().includes(q) ||
                r.description?.toLowerCase().includes(q) ||
                r.tags?.some(t => t.toLowerCase().includes(q))
            );
        }

        // Category filter
        if (selectedCategory !== 'All') {
            result = result.filter(r => (r.category || 'Other').trim() === selectedCategory);
        }

        // Type filter
        if (selectedTypes.length > 0) {
            result = result.filter(r => selectedTypes.includes(r.type));
        }

        // Sort
        result.sort((a, b) => {
            if (sortBy === 'latest') return new Date(b.addedAt) - new Date(a.addedAt);
            if (sortBy === 'oldest') return new Date(a.addedAt) - new Date(b.addedAt);
            if (sortBy === 'az') return (a.title || '').localeCompare(b.title || '');
            return 0;
        });

        return result;
    }, [resources, viewMode, searchQuery, selectedCategory, selectedTypes, sortBy, bookmarks]);

    const toggleBookmark = (id) => {
        setBookmarks(prev =>
            prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
        );
    };

    const toggleType = (type) => {
        setSelectedTypes(prev =>
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        );
    };

    const dynamicCategories = useMemo(() => {
        const list = new Set(CATEGORIES);
        resources.forEach(r => {
            const cat = (r.category || 'Other').trim();
            if (cat !== '') list.add(cat);
        });
        return Array.from(list);
    }, [resources]);

    const categoryCounts = useMemo(() => {
        const counts = { 'All': resources.length };
        dynamicCategories.forEach(c => {
            counts[c] = resources.filter(r => (r.category || 'Other').trim() === c).length;
        });
        return counts;
    }, [resources, dynamicCategories]);

    return (
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B1120] transition-colors duration-200 font-sans text-slate-900 dark:text-white">
            {/* NAVBAR */}
            <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#0B1120]/80 backdrop-blur-md border-b border-slate-200 dark:border-[#1E293B]">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Box className="w-6 h-6 text-rose-500 dark:text-rose-400" />
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-500 to-orange-500 dark:from-rose-400 dark:to-orange-400 hidden sm:block">
                            TechBase <span className="text-[10px] uppercase tracking-[0.2em] font-medium ml-1 opacity-70">by Ejidio</span>
                        </h1>
                    </div>

                    <div className="flex-1 max-w-xl px-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search resources, tags..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-[#131B2F] border-transparent focus:bg-white dark:focus:bg-[#1E293B] border focus:border-indigo-500 rounded-full text-sm transition-all focus:ring-2 focus:ring-indigo-500/20 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4">
                        <button
                            onClick={() => setViewMode(viewMode === 'all' ? 'bookmarked' : 'all')}
                            className={`relative p-2 rounded-full transition-colors ${viewMode === 'bookmarked' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                            title="Bookmarks"
                        >
                            <Bookmark className="w-5 h-5" />
                            {bookmarks.length > 0 && (
                                <span className="absolute top-0 right-0 w-4 h-4 text-[10px] bg-red-500 text-white rounded-full flex items-center justify-center -translate-y-1/4 translate-x-1/4 border-2 border-white dark:border-slate-900">
                                    {bookmarks.length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={toggleDarkMode}
                            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                            title="Toggle Dark Mode"
                        >
                            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                        <button
                            onClick={() => navigate('/admin')}
                            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors sm:hidden"
                        >
                            <LayoutDashboard className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => navigate('/admin')}
                            className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        >
                            Admin
                        </button>
                        <button
                            className="sm:hidden p-2 text-slate-600 dark:text-slate-300"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        >
                            <Filter className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 flex gap-8">
                {/* SIDEBAR */}
                <aside className={`${mobileMenuOpen ? 'fixed inset-0 z-40 bg-white dark:bg-[#0B1120] p-4 pt-20 overflow-y-auto' : 'hidden'} sm:block sm:static sm:w-64 sm:p-0 sm:pt-0 sm:bg-transparent shrink-0`}>
                    {mobileMenuOpen && (
                        <button
                            className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-[#131B2F] rounded-full sm:hidden"
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            <X className="w-5 h-5 text-slate-800 dark:text-white" />
                        </button>
                    )}

                    <div className="space-y-8 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar pb-8 pr-2">
                        <div>
                            <h3 className="text-[11px] font-semibold text-slate-400 dark:text-[#8492C4] uppercase tracking-wider mb-3">Categories</h3>
                            <ul className="space-y-1">
                                <li key="All">
                                    <button
                                        onClick={() => { setSelectedCategory('All'); setMobileMenuOpen(false); }}
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-colors ${selectedCategory === 'All' ? 'bg-indigo-50 text-indigo-700 dark:bg-[#1C253B] dark:text-[#8B8BFF] font-medium' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-[#131B2F]'}`}
                                    >
                                        <span>All Resources</span>
                                        <span className="bg-slate-100 dark:bg-[#131B2F] text-slate-500 dark:text-[#8492C4] py-0.5 px-2 rounded-md text-[11px] font-medium border border-slate-200 dark:border-[#1E293B]">
                                            {categoryCounts['All']}
                                        </span>
                                    </button>
                                </li>
                                {dynamicCategories.map(c => (
                                    <li key={c}>
                                        <button
                                            onClick={() => { setSelectedCategory(c); setMobileMenuOpen(false); }}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-colors ${selectedCategory === c ? 'bg-indigo-50 text-indigo-700 dark:bg-[#1C253B] dark:text-[#8B8BFF] font-medium' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-[#131B2F]'}`}
                                        >
                                            <span className="truncate pr-2 text-left">{c}</span>
                                            <span className="bg-slate-100 dark:bg-[#131B2F] text-slate-500 dark:text-[#8492C4] py-0.5 px-2 rounded-md text-[11px] font-medium border border-slate-200 dark:border-[#1E293B]">
                                                {categoryCounts[c]}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-[11px] font-semibold text-slate-400 dark:text-[#8492C4] uppercase tracking-wider mb-3">Resource Type</h3>
                            <div className="flex flex-wrap gap-2">
                                {TYPES.map(type => (
                                    <button
                                        key={type}
                                        onClick={() => toggleType(type)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border ${selectedTypes.includes(type) ? 'bg-slate-800 text-white border-slate-800 dark:bg-[#1C253B] dark:text-[#8B8BFF] dark:border-[#2D3852]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 dark:bg-transparent dark:border-[#1E293B] dark:text-[#8492C4] dark:hover:border-[#2D3852] dark:hover:text-white'}`}
                                    >
                                        {React.cloneElement(TYPE_ICONS[type] || TYPE_ICONS.other, { className: "w-3 h-3" })}
                                        <span className="capitalize">{type}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </aside>

                {/* MAIN CONTENT */}
                <main className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                            {viewMode === 'bookmarked' ? 'My Bookmarks' : selectedCategory}
                            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-[#8492C4]">
                                ({filteredResources.length})
                            </span>
                        </h2>
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-slate-500 dark:text-[#8492C4]">Sort by:</label>
                            <select
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value)}
                                className="bg-white dark:bg-[#131B2F] border border-slate-200 dark:border-[#1E293B] text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none cursor-pointer"
                            >
                                <option value="latest">Latest Added</option>
                                <option value="oldest">Oldest First</option>
                                <option value="az">Alphabetical (A-Z)</option>
                            </select>
                        </div>
                    </div>

                    {filteredResources.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-[#131B2F]/50 rounded-2xl border border-slate-100 dark:border-[#1E293B] border-dashed">
                            <div className="w-16 h-16 mb-4 rounded-full bg-slate-50 dark:bg-[#1C253B] flex items-center justify-center border border-slate-100 dark:border-[#2D3852]">
                                <Search className="w-8 h-8 text-slate-400 dark:text-[#8492C4]" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">No resources found</h3>
                            <p className="text-slate-500 dark:text-[#8492C4] max-w-sm text-sm">
                                Try adjusting your search query or filters to find what you're looking for.
                            </p>
                            {(searchQuery || selectedCategory !== 'All' || selectedTypes.length > 0 || viewMode === 'bookmarked') && (
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSelectedCategory('All');
                                        setSelectedTypes([]);
                                        setViewMode('all');
                                    }}
                                    className="mt-6 text-indigo-600 dark:text-[#8B8BFF] text-sm font-bold hover:underline"
                                >
                                    Clear all filters
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredResources.map(resource => (
                                <ResourceCard
                                    key={resource.id}
                                    resource={resource}
                                    isBookmarked={bookmarks.includes(resource.id)}
                                    onBookmark={() => toggleBookmark(resource.id)}
                                    onTagClick={(tag) => setSearchQuery(tag)}
                                />
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

function ResourceCard({ resource, isBookmarked, onBookmark, onTagClick }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const isNewlyAdded = isNew(resource.addedAt);
    const displayImage = resource.thumbnail || (resource.url ? `https://s.wordpress.com/mshots/v1/${encodeURIComponent(resource.url)}?w=800` : null);
    const hasLongDescription = resource.description && resource.description.length > 160;

    return (
        <div className="group flex flex-col bg-white dark:bg-[#131B2F] rounded-2xl border border-slate-200 dark:border-transparent overflow-hidden hover:shadow-xl hover:shadow-[#5B45FF]/10 hover:-translate-y-1 transition-all duration-300">
            {/* Top area - Thumbnail or Icon layout */}
            {displayImage ? (
                <div className="w-full h-48 bg-slate-100 dark:bg-[#0B1120] relative overflow-hidden shrink-0 border-b border-slate-200 dark:border-[#1E293B]">
                    <img
                        src={displayImage}
                        alt={resource.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                        onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.classList.add('flex', 'items-center', 'justify-center'); }}
                    />
                    <div className="absolute top-4 left-4 flex gap-2">
                        {isNewlyAdded && (
                            <span className="bg-emerald-500 dark:bg-[#0CD78E] text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                                NEW
                            </span>
                        )}
                        <span className="bg-slate-900/80 dark:bg-[#1C253B] border border-slate-700 dark:border-[#2D3852] text-white text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                            {React.cloneElement(TYPE_ICONS[resource.type] || TYPE_ICONS.other, { className: "w-3 h-3" })} {resource.type}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="w-full h-48 bg-slate-50 dark:bg-[#131B2F] relative overflow-hidden shrink-0 flex items-center justify-center border-b border-slate-100 dark:border-[#1E293B]/50">
                    <div className="absolute top-4 left-4 flex gap-2 z-10">
                        {isNewlyAdded && (
                            <span className="bg-emerald-500 dark:bg-[#0CD78E] text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                                NEW
                            </span>
                        )}
                        <span className="bg-white dark:bg-[#1C253B] border border-slate-200 dark:border-[#2D3852] text-slate-700 dark:text-white text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-sm">
                            {React.cloneElement(TYPE_ICONS[resource.type] || TYPE_ICONS.other, { className: "w-3 h-3" })} {resource.type}
                        </span>
                    </div>
                    {/* Big Icon Background */}
                    <div className="text-slate-200 dark:text-[#1C253B] transform scale-150 transition-transform duration-700 group-hover:scale-[1.6]">
                        {React.cloneElement(TYPE_ICONS[resource.type] || TYPE_ICONS.other, { className: "w-24 h-24 drop-shadow-sm" })}
                    </div>

                    <button
                        onClick={(e) => { e.preventDefault(); onBookmark(); }}
                        className={`absolute top-4 right-4 p-2 rounded-full transition-colors z-10 ${isBookmarked
                            ? 'text-white bg-indigo-500 shadow-md shadow-indigo-500/30'
                            : 'text-slate-400 bg-white shadow-sm dark:bg-[#0B1120] dark:text-slate-500 hover:text-white transition-colors'
                            }`}
                    >
                        <Bookmark className="w-4 h-4" fill={isBookmarked ? "currentColor" : "none"} />
                    </button>
                </div>
            )}

            <div className="p-6 flex flex-col flex-1">
                {displayImage && (
                    <button
                        onClick={(e) => { e.preventDefault(); onBookmark(); }}
                        className={`absolute top-4 right-4 p-2 rounded-full transition-colors z-10 ${isBookmarked
                            ? 'text-white bg-indigo-500 shadow-md shadow-indigo-500/30'
                            : 'text-slate-400 bg-white/90 shadow-sm dark:bg-[#0B1120]/80 dark:text-slate-400 hover:text-white transition-colors backdrop-blur-sm'
                            }`}
                    >
                        <Bookmark className="w-4 h-4" fill={isBookmarked ? "currentColor" : "none"} />
                    </button>
                )}

                <div className="mb-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-[#8492C4] mb-2 block">
                        {resource.category}
                    </span>
                    <h3 className="font-bold text-xl text-slate-900 dark:text-[#8B8BFF] leading-tight line-clamp-2" title={resource.title}>
                        {resource.title}
                    </h3>
                </div>

                <p className={`text-sm text-slate-500 dark:text-slate-300 ${isExpanded ? '' : 'line-clamp-3'} mb-2 flex-1 leading-relaxed`}>
                    {resource.description}
                </p>

                {hasLongDescription && (
                    <button
                        onClick={(e) => { e.preventDefault(); setIsExpanded(!isExpanded); }}
                        className="text-[12px] font-bold text-indigo-600 dark:text-[#8B8BFF] hover:underline mb-4 flex items-center gap-1"
                    >
                        {isExpanded ? 'Show Less' : 'Read More...'}
                    </button>
                )}

                <div className="flex flex-wrap gap-2 mb-5">
                    {resource.tags && resource.tags.slice(0, 4).map(tag => (
                        <button
                            key={tag}
                            onClick={(e) => { e.preventDefault(); onTagClick(tag); }}
                            className="text-[12px] font-medium bg-slate-100 dark:bg-[#242E46] text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-[#2D3852] transition-colors"
                        >
                            #{tag}
                        </button>
                    ))}
                    {resource.tags && resource.tags.length > 4 && (
                        <span className="text-[12px] font-medium text-slate-400 px-1 py-1">+{resource.tags.length - 4}</span>
                    )}
                </div>

                <div className="flex items-center justify-between pt-5 border-t border-slate-100 dark:border-[#242E46] mt-auto">
                    <span className="text-[13px] text-slate-400 dark:text-slate-400 font-medium flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 opacity-70" /> {formatDate(resource.addedAt)}
                    </span>
                    <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[13px] font-bold text-indigo-600 dark:text-[#8B8BFF] hover:dark:text-white transition-colors"
                    >
                        Visit Link <LinkIcon className="w-3.5 h-3.5" />
                    </a>
                </div>
            </div>
        </div>
    );
}

// --- ADMIN LOGIN ---
function AdminLogin({ setAuth, navigate, darkMode }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = (e) => {
        e.preventDefault();
        if (username === 'admin' && password === 'Bijibiji@748!!!') {
            const token = 'auth_' + Date.now();
            setAuth(token);
            navigate('/admin');
        } else {
            setError('Invalid credentials');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4 transition-colors duration-200">
            <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
                <div className="flex justify-center mb-6">
                    <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
                        <LayoutDashboard className="w-6 h-6" />
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-center text-slate-900 dark:text-white mb-2">Admin Access</h2>
                <p className="text-center text-slate-500 dark:text-slate-400 mb-8 text-sm">Sign in to manage blog resources</p>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                        <AlertCircle className="w-4 h-4" /> {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all dark:text-white"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all dark:text-white"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors mt-2"
                    >
                        Sign In
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={() => navigate('/')}
                        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center justify-center gap-1 mx-auto"
                    >
                        <Home className="w-4 h-4" /> Back to site
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- ADMIN DASHBOARD ---
function AdminDashboard({ resources, setResources, setAuth, navigate, darkMode, toggleDarkMode }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingResource, setEditingResource] = useState(null);
    const [toast, setToast] = useState(null);

    // Bulk AI Recategorization State
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [bulkResults, setBulkResults] = useState([]);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

    const showToast = (message, type = 'success') => {
        console.log(`Toast: [${type}] ${message}`);
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleRefresh = async () => {
        showToast("Synchronizing with cloud...");
        try {
            const snapshot = await getDocs(collection(db, "resources"));
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            const sortedData = data.sort((a, b) => {
                const dateA = a.addedAt ? new Date(a.addedAt) : new Date(0);
                const dateB = b.addedAt ? new Date(b.addedAt) : new Date(0);
                return dateB - dateA;
            });
            setResources([...sortedData]);
            showToast(`Sync complete: ${data.length} items found`);
        } catch (err) {
            console.error("Manual sync error:", err);
            showToast("Sync failed", "error");
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this resource? This will also remove it from user bookmarks.")) {
            try {
                await deleteDoc(doc(db, "resources", id));

                // Cleanup bookmarks from localStorage
                const bookmarks = lsGet('techblog_bookmarks', []);
                const newBookmarks = bookmarks.filter(bId => bId !== id);
                lsSet('techblog_bookmarks', newBookmarks);

                showToast("Resource deleted");
            } catch (err) {
                console.error("Delete error", err);
                showToast("Failed to delete", "error");
            }
        }
    };

    const openAddModal = () => {
        setEditingResource(null);
        setIsModalOpen(true);
    };

    const openEditModal = (resource) => {
        setEditingResource(resource);
        setIsModalOpen(true);
    };

    const saveResource = async (resourceData) => {
        console.log("Saving resource to Firestore:", resourceData);
        try {
            if (editingResource) {
                const docRef = doc(db, "resources", editingResource.id);
                await updateDoc(docRef, resourceData);
                console.log("Resource updated successfully");
                showToast("Resource updated successfully");
            } else {
                const newResource = {
                    ...resourceData,
                    addedAt: new Date().toISOString(),
                    addedBy: 'admin'
                };
                const docRef = await addDoc(collection(db, "resources"), newResource);
                console.log("Resource added successfully with ID:", docRef.id);
                showToast("Resource added successfully");
            }
            setIsModalOpen(false);
        } catch (err) {
            console.error("Save error:", err);
            showToast("Failed to save resource", "error");
        }
    };

    const runBulkAIRecategorize = async () => {
        const apiKey = lsGet('techblog_groq_key', '');
        if (!apiKey) {
            alert("Please set your Groq API key in any Resource Edit modal first.");
            return;
        }

        // We target resources in "Other" or "Tools & Productivity" or anything the user might want.
        // For now, let's just pick those that likely need it or all of them?
        // Let's filter for "Tools & Productivity" and "Other" specifically to be safe/useful
        const targets = resources.filter(r => r.category === 'Tools & Productivity' || r.category === 'Other');

        if (targets.length === 0) {
            alert("No resources found in 'Tools & Productivity' or 'Other' categories to recategorize.");
            return;
        }

        if (!window.confirm(`AI will now analyze ${targets.length} resources to suggest better categories. Continue?`)) return;

        setIsBulkProcessing(true);
        setBulkResults([]);
        setBulkProgress({ current: 0, total: targets.length });
        setIsBulkModalOpen(true);

        const results = [];

        for (let i = 0; i < targets.length; i++) {
            const res = targets[i];
            setBulkProgress({ current: i + 1, total: targets.length });

            try {
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile", // Using a smarter model for accuracy
                        messages: [
                            {
                                role: "system",
                                content: `You are a meticulous tech librarian. Your goal is to accurately categorize technical resources into a professional blog structure.
                                
                                AVAILABLE CATEGORIES:
                                ${CATEGORIES.join('\n- ')}

                                RULES:
                                1. Evaluate the Title, URL, and Description carefully.
                                2. "Tools & Productivity" should ONLY be used for actual productivity software (e.g., Notion, IDEs, etc.).
                                3. If a resource discusses coding, tutorials, or framework internals, use "Web Development" or "Programming Languages".
                                4. If it discusses AI models, training, or prompt engineering, use "AI & Machine Learning".
                                5. Return ONLY the exact category name from the list above. No explanation, no punctuation.`
                            },
                            {
                                role: "user",
                                content: `Resource to classify:
                                Title: ${res.title}
                                URL: ${res.url}
                                Description: ${res.description || 'No description provided.'}`
                            }
                        ],
                        temperature: 0.1,
                        max_tokens: 60
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    let newCat = data.choices[0].message.content.trim();
                    // Basic cleanup: remove any trailing dots or "Category: " prefixes if the AI ignored instructions
                    newCat = newCat.replace(/Category:\s*/i, '').replace(/[".]/g, '');

                    // Validation against existing list
                    newCat = CATEGORIES.find(c => c.toLowerCase() === newCat.toLowerCase()) || res.category;

                    if (newCat !== res.category) {
                        results.push({
                            id: res.id,
                            title: res.title,
                            url: res.url,
                            oldCategory: res.category,
                            newCategory: newCat
                        });
                        setBulkResults(prev => [...prev, {
                            id: res.id,
                            title: res.title,
                            url: res.url,
                            oldCategory: res.category,
                            newCategory: newCat
                        }]);
                    }
                }
            } catch (e) {
                console.error("AI Bulk Error", e);
            }
            // Small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 200));
        }

        setIsBulkProcessing(false);
        if (results.length === 0) {
            showToast("AI found no better categories for these resources.");
            setIsBulkModalOpen(false);
        }
    };

    const applyBulkResults = () => {
        setResources(prev => {
            const newRes = [...prev];
            bulkResults.forEach(update => {
                const idx = newRes.findIndex(r => r.id === update.id);
                if (idx !== -1) {
                    newRes[idx] = { ...newRes[idx], category: update.newCategory };
                }
            });
            return newRes;
        });
        setIsBulkModalOpen(false);
        showToast(`Successfully recategorized ${bulkResults.length} resources!`);
    };

    // Stats
    const thisWeekCount = useMemo(() => resources.filter(r => isNew(r.addedAt)).length, [resources]);
    const activeCategoriesCount = useMemo(() => new Set(resources.map(r => r.category)).size, [resources]);
    const mostUsedTag = useMemo(() => {
        const counts = {};
        resources.forEach(r => {
            r.tags?.forEach(tag => { counts[tag] = (counts[tag] || 0) + 1; });
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        return sorted.length > 0 ? sorted[0][0] : 'None';
    }, [resources]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] transition-colors duration-200 flex flex-col font-sans">
            {/* Admin Navbar */}
            <header className="bg-white dark:bg-[#0B1120] border-b border-slate-200 dark:border-[#1E293B] sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <LayoutDashboard className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <h1 className="font-bold text-slate-900 dark:text-white">Admin Dashboard</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleDarkMode}
                            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-[#1E293B] text-slate-600 dark:text-slate-300 transition-colors"
                            title="Toggle Dark Mode"
                        >
                            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>
                        <div className="w-px h-6 bg-slate-200 dark:bg-[#1E293B]"></div>
                        <button
                            onClick={() => navigate('/')}
                            className="text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors"
                        >
                            <Globe className="w-4 h-4" /> View Site
                        </button>
                        <div className="w-px h-6 bg-slate-200 dark:bg-[#1E293B]"></div>
                        <button
                            onClick={() => { setAuth(null); navigate('/'); }}
                            className="text-sm font-medium text-slate-600 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400 flex items-center gap-1 transition-colors"
                        >
                            <LogOut className="w-4 h-4" /> Logout
                        </button>
                    </div>
                </div>
            </header>

            <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">

                {/* Stats Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
                    <StatCard title="Total Resources" value={resources.length} icon={<Box />} iconColor="blue-500" />
                    <StatCard title="Categories" value={activeCategoriesCount} icon={<Filter />} iconColor="purple-500" />
                    <StatCard title="Most Used Tag" value={mostUsedTag} stringValue icon={<Bookmark />} iconColor="emerald-500" />
                    <StatCard title="Added This Week" value={thisWeekCount} icon={<Search />} iconColor="orange-500" />
                </div>

                {/* Header & Actions */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 bg-[#0F172A]/50 p-4 rounded-xl border border-slate-200 dark:border-[#1E293B]">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">Manage Resources</h2>
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => {
                                const dataStr = JSON.stringify(resources, null, 2);
                                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                                const url = URL.createObjectURL(dataBlob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = `techblog_resources_${new Date().toISOString().split('T')[0]}.json`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                URL.revokeObjectURL(url);
                                showToast('Resources exported successfully');
                            }}
                            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#131B2F] dark:hover:bg-[#1E293B] text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-200 dark:border-[#2D3852]"
                            title="Export to JSON"
                        >
                            <Download className="w-4 h-4" /> Export
                        </button>

                        <label className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#131B2F] dark:hover:bg-[#1E293B] text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-200 dark:border-[#2D3852] cursor-pointer" title="Import from JSON">
                            <Upload className="w-4 h-4" /> Import
                            <input
                                type="file"
                                accept=".json"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files[0];
                                    if (!file) return;

                                    const reader = new FileReader();
                                    reader.onload = async (event) => {
                                        try {
                                            const importedData = JSON.parse(event.target.result);
                                            if (!Array.isArray(importedData)) throw new Error("Expected an array of resources");

                                            showToast(`Uploading ${importedData.length} resources...`);
                                            const batch = writeBatch(db);
                                            const localIds = new Set(resources.map(r => r.id));
                                            let addedCount = 0;

                                            importedData.forEach(item => {
                                                // Prevent duplicates by checking local state IDs
                                                if (!item.id || !localIds.has(item.id)) {
                                                    const newDocRef = doc(collection(db, "resources"));
                                                    const { id, ...data } = item;
                                                    batch.set(newDocRef, {
                                                        ...data,
                                                        addedAt: data.addedAt || new Date().toISOString(),
                                                        addedBy: data.addedBy || 'admin'
                                                    });
                                                    addedCount++;
                                                }
                                            });

                                            if (addedCount > 0) {
                                                await batch.commit();
                                                showToast(`Successfully synced ${addedCount} resources to cloud!`);
                                            } else {
                                                showToast("No new resources to import.");
                                            }
                                        } catch (err) {
                                            console.error("Import/Sync Error:", err);
                                            alert("Failed to import: " + err.message);
                                        }
                                    };
                                    reader.readAsText(file);
                                    e.target.value = null;
                                }}
                            />
                        </label>

                        <button
                            onClick={handleRefresh}
                            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#131B2F] dark:hover:bg-[#1E293B] text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-200 dark:border-[#2D3852]"
                            title="Force sync with Firestore"
                        >
                            <Clock className="w-4 h-4" /> Refresh
                        </button>

                        <button
                            onClick={runBulkAIRecategorize}
                            disabled={isBulkProcessing}
                            className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-indigo-200 dark:border-indigo-500/30"
                            title="AI Recategorize All"
                        >
                            <Box className="w-4 h-4" /> Bulk Recategorize (AI)
                        </button>

                        <button
                            onClick={openAddModal}
                            className="flex items-center gap-2 bg-[#5B45FF] hover:bg-[#4E3BE0] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-[#5B45FF]/20"
                        >
                            <Plus className="w-4 h-4" /> Add New Resource
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white dark:bg-[#131B2F] border border-slate-200 dark:border-[#1E293B] rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                            <thead className="bg-slate-50 dark:bg-[#131B2F] text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-500 border-b border-slate-200 dark:border-[#1E293B]">
                                <tr>
                                    <th className="px-6 py-5">Resource</th>
                                    <th className="px-6 py-5">Category</th>
                                    <th className="px-6 py-5">Type</th>
                                    <th className="px-6 py-5">Date Added</th>
                                    <th className="px-6 py-5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-[#1E293B]">
                                {resources.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                                            No resources added yet. Click "Add New Resource" to start.
                                        </td>
                                    </tr>
                                ) : (
                                    resources.map(resource => (
                                        <tr key={resource.id} className="hover:bg-slate-50 dark:hover:bg-[#1A233A] transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-[#1E293B] border border-slate-200 dark:border-[#2D3852] flex items-center justify-center shrink-0">
                                                        <span className="text-slate-500 dark:text-slate-400 opacity-80">
                                                            {TYPE_ICONS[resource.type] || TYPE_ICONS.other}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-900 dark:text-white mb-0.5 line-clamp-1">{resource.title}</div>
                                                        <a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-indigo-600 dark:text-slate-500 hover:text-slate-400 hover:underline line-clamp-1 truncate max-w-[250px]">{resource.url}</a>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-[#1C253B] text-slate-700 dark:text-slate-400 border border-slate-200 dark:border-[#2D3852]">
                                                    {resource.category}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 capitalize whitespace-nowrap">
                                                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                                                    {React.cloneElement(TYPE_ICONS[resource.type] || TYPE_ICONS.other, { className: "w-3.5 h-3.5" })} {resource.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-500 font-medium">
                                                {formatDate(resource.addedAt)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                    <button onClick={() => openEditModal(resource)} className="text-slate-400 hover:text-white transition-colors" title="Edit">
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDelete(resource.id)} className="text-slate-400 hover:text-red-400 transition-colors" title="Delete">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                {isBulkModalOpen && (
                    <BulkAIResultsModal
                        results={bulkResults}
                        progress={bulkProgress}
                        isProcessing={isBulkProcessing}
                        onApply={applyBulkResults}
                        onClose={() => setIsBulkModalOpen(false)}
                    />
                )}
            </div>

            {isModalOpen && (
                <ResourceModal
                    resource={editingResource}
                    onClose={() => setIsModalOpen(false)}
                    onSave={saveResource}
                />
            )}

            {/* Toast Notification */}
            {toast && (
                <div className="fixed bottom-6 right-6 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl rounded-lg p-4 flex items-center gap-3 z-50 animate-bounce-short">
                    {toast.type === 'success' ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                    ) : (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{toast.message}</span>
                </div>
            )}
        </div>
    );
}

function BulkAIResultsModal({ results, progress, onApply, onClose, isProcessing }) {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-[#131B2F] rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-[#1E293B] overflow-hidden flex flex-col max-h-[85vh]">
                <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-[#0B1120]/50">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <Box className="w-5 h-5 text-indigo-500" /> AI Recategorization
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">AI suggestions to fix "Tools" and "Other" categories</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#8492C4]"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/30 dark:bg-transparent">
                    {isProcessing && (
                        <div className="mb-6 bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Processing Resources...
                                </span>
                                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 px-2 py-1 rounded-md">
                                    {progress.current} / {progress.total}
                                </span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                                <div className="bg-indigo-500 h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        {results.length === 0 && !isProcessing && (
                            <div className="text-center py-10">
                                <Search className="w-12 h-12 text-slate-300 mx-auto mb-3 opacity-20" />
                                <p className="text-slate-500">No suggestions found yet.</p>
                            </div>
                        )}
                        {results.map((res, i) => (
                            <div key={i} className="p-4 rounded-xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#0B1120]/40 flex items-center justify-between gap-4 shadow-sm group hover:border-indigo-300 dark:hover:border-indigo-500/30 transition-all">
                                <div className="min-w-0 flex-1">
                                    <h4 className="font-bold text-slate-800 dark:text-white truncate text-sm">{res.title}</h4>
                                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{res.url}</p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-[9px] px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-400 line-through uppercase font-bold tracking-tight">{res.oldCategory}</span>
                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    <span className="text-[10px] px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-black uppercase tracking-wider border border-emerald-100 dark:border-emerald-800/50 shadow-sm">{res.newCategory}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-5 border-t border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-[#0B1120]/50 flex justify-end gap-3 items-center">
                    {!isProcessing && (
                        <span className="text-xs text-slate-500 mr-auto font-medium">Found {results.length} improvement suggestions</span>
                    )}
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-[#8492C4] hover:text-slate-900 dark:hover:text-white transition-colors">
                        {isProcessing ? 'Cancel Order' : 'Dismiss'}
                    </button>
                    {!isProcessing && results.length > 0 && (
                        <button
                            onClick={onApply}
                            className="bg-[#5B45FF] hover:bg-[#4E3BE0] text-white px-8 py-2.5 rounded-xl text-sm font-black shadow-xl shadow-[#5B45FF]/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
                        >
                            Apply All Changes
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, stringValue, iconColor }) {
    return (
        <div className="bg-white dark:bg-[#131B2F]/60 border border-slate-200 dark:border-[#1E293B] p-5 rounded-xl flex flex-col justify-between h-32 hover:border-[#5B45FF]/30 transition-colors group">
            <div className="flex justify-between items-start">
                <p className="text-[11px] font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">{title}</p>
                <div className={`text-indigo-600 dark:text-${iconColor || 'indigo-400'} opacity-80 group-hover:opacity-100 transition-opacity`}>
                    {React.cloneElement(icon, { className: "w-5 h-5" })}
                </div>
            </div>
            <div>
                <p className={`text-3xl font-bold text-slate-900 dark:text-white mt-2 ${stringValue ? 'text-2xl truncate max-w-[200px]' : ''}`}>
                    {value}
                </p>
            </div>
        </div>
    );
}

// --- RESOURCE MODAL w/ AI Autocomplete ---
function ResourceModal({ resource, onClose, onSave }) {
    const [formData, setFormData] = useState(resource || {
        url: '', title: '', description: '', tags: '', category: CATEGORIES[0], type: 'website', thumbnail: '', pinned: false
    });

    const [apiKey, setApiKey] = useState(() => lsGet('techblog_groq_key', ''));

    useEffect(() => {
        lsSet('techblog_groq_key', apiKey);
    }, [apiKey]);
    const [isLoadingFetch, setIsLoadingFetch] = useState(false);
    const [fetchError, setFetchError] = useState('');

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleTagsChange = (e) => {
        setFormData(prev => ({ ...prev, tags: e.target.value }));
    };

    const autofillWithAI = async () => {
        if (!formData.url) {
            setFetchError("Please enter a URL first.");
            return;
        }
        const cleanApiKey = apiKey.trim();
        if (!cleanApiKey) {
            setFetchError("Please enter your Groq API key to use auto-fill.");
            return;
        }

        setIsLoadingFetch(true);
        setFetchError('');

        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cleanApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        {
                            role: "system",
                            content: "You are a metadata extractor for a tech resource blog. Given a URL, return ONLY valid JSON with these fields: title, description (2-3 sentence summary of what the resource is about), tags (array of 3-5 relevant lowercase tech tags), category (one of: AI & Machine Learning, Web Development, DevOps & Cloud, Data Science, Cybersecurity, Programming Languages, Tools & Productivity, Open Source, Tutorials & Courses, Research & Papers, Other), type (one of: youtube, playlist, github, document, website, other). Return nothing else — just the raw JSON object, no markdown, no code fences."
                        },
                        {
                            role: "user",
                            content: `Extract metadata for this URL: ${formData.url}`
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 500
                })
            });

            if (!response.ok) {
                let errMessage = `API error: ${response.status}`;
                try {
                    const errData = await response.json();
                    errMessage += ` - ${errData.error?.message || JSON.stringify(errData)}`;
                } catch (e) {
                    // Ignore
                }
                throw new Error(errMessage);
            }

            const data = await response.json();
            let content = data.choices[0].message.content;

            // Strip markdown code fences if present
            content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

            const parsed = JSON.parse(content);

            setFormData(prev => ({
                ...prev,
                title: parsed.title || prev.title,
                description: parsed.description || prev.description,
                tags: Array.isArray(parsed.tags) ? parsed.tags.join(', ') : prev.tags,
                category: CATEGORIES.includes(parsed.category) ? parsed.category : CATEGORIES[0],
                type: TYPES.includes(parsed.type?.toLowerCase()) ? parsed.type.toLowerCase() : 'website'
            }));

        } catch (err) {
            console.error(err);
            setFetchError("Failed to fetch metadata. " + (err.message || "Parse error."));
        } finally {
            setIsLoadingFetch(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.url || !formData.title || !formData.description) {
            alert("URL, Title, and Description are required.");
            return;
        }

        const payload = {
            ...formData,
            tags: typeof formData.tags === 'string'
                ? formData.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
                : formData.tags
        };

        onSave(payload);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-[#131B2F] rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-[#1E293B] overflow-hidden my-auto shrink-0 flex flex-col max-h-[90vh]">

                <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-[#0B1120]/50">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                        {resource ? 'Edit Resource' : 'Add New Resource'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#8492C4] transition-colors p-1">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                    {/* AI Autofill Banner */}
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-xl p-4 mb-6">
                        <h4 className="flex items-center gap-2 font-medium text-indigo-800 dark:text-indigo-300 mb-2 text-sm">
                            <LogOut className="w-4 h-4 rotate-90" /> AI Auto-Fill via Groq
                        </h4>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex-1">
                                <input
                                    type="url"
                                    name="url"
                                    placeholder="Paste resource URL here..."
                                    value={formData.url}
                                    onChange={handleChange}
                                    className="w-full p-2 bg-white dark:bg-[#0B1120] border border-indigo-200 dark:border-[#2D3852] rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm dark:text-white"
                                />
                            </div>
                            <div className="flex-1">
                                <input
                                    type="password"
                                    placeholder="Paste Groq API Key..."
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    className="w-full p-2 bg-white dark:bg-[#0B1120] border border-indigo-200 dark:border-[#2D3852] rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm dark:text-white"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={autofillWithAI}
                                disabled={isLoadingFetch || !formData.url}
                                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center justify-center min-w-[120px]"
                            >
                                {isLoadingFetch ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</> : 'Auto-Fill Fields'}
                            </button>
                        </div>
                        {fetchError && (
                            <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {fetchError}
                            </p>
                        )}
                    </div>

                    <form id="resource-form" onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-[#8492C4] mb-1.5">Title *</label>
                            <input
                                type="text" name="title" required value={formData.title} onChange={handleChange}
                                className="w-full p-2.5 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-[#1E293B] rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-[#8492C4] mb-1.5">Description *</label>
                            <textarea
                                name="description" required rows="3" value={formData.description} onChange={handleChange}
                                className="w-full p-2.5 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-[#1E293B] rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white resize-none"
                            ></textarea>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-[#8492C4] mb-1.5">Category *</label>
                                <select
                                    name="category" value={formData.category} onChange={handleChange}
                                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-[#1E293B] rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                                >
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-[#8492C4] mb-1.5">Type *</label>
                                <select
                                    name="type" value={formData.type} onChange={handleChange}
                                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-[#1E293B] rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white capitalize"
                                >
                                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-[#8492C4] mb-1.5">Tags (comma separated)</label>
                                <input
                                    type="text" value={typeof formData.tags === 'string' ? formData.tags : formData.tags?.join(', ')} onChange={handleTagsChange} placeholder="react, hooks, tutorial"
                                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-[#1E293B] rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-[#8492C4] mb-1.5">Thumbnail URL (optional)</label>
                                <input
                                    type="url" name="thumbnail" value={formData.thumbnail} onChange={handleChange} placeholder="https://..."
                                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-[#1E293B] rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mt-2">
                            <input
                                type="checkbox" id="pinned" name="pinned" checked={formData.pinned} onChange={handleChange}
                                className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                            />
                            <label htmlFor="pinned" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                                Pin to top of lists
                            </label>
                        </div>
                    </form>
                </div>

                <div className="p-5 border-t border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-[#0B1120]/50 flex justify-end gap-3 mt-auto">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-[#8492C4] dark:hover:text-white transition-colors">
                        Cancel
                    </button>
                    <button type="submit" form="resource-form" className="bg-slate-900 hover:bg-slate-800 dark:bg-[#5B45FF] dark:hover:bg-[#4E3BE0] text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-[#5B45FF]/10">
                        {resource ? 'Save Changes' : 'Add Resource'}
                    </button>
                </div>
            </div>
        </div>
    );
}
