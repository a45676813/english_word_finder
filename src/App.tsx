import { useState, useEffect, useRef } from 'react';
import { Search, Volume2, BookOpen, History, Image as ImageIcon, ExternalLink, Loader2, ArrowRight, LogIn, User as UserIcon, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getWordDetails, WordDetails } from './services/gemini';
import { getDictionaryData, DictionaryEntry } from './services/dictionary';
import { auth, signInWithGoogle, addWordToVocab } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import ReactMarkdown from 'react-markdown';

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('正在分析單字...');
  const [wordData, setWordData] = useState<WordDetails | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      const messages = ['正在分析單字...', '正在翻譯例句...', '正在查找詞源...', '即將完成...'];
      let i = 0;
      interval = setInterval(() => {
        i = (i + 1) % messages.length;
        setLoadingMessage(messages[i]);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [loading]);
  const [dictData, setDictData] = useState<DictionaryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [addingWord, setAddingWord] = useState(false);
  const [addedWords, setAddedWords] = useState<Set<string>>(new Set());
  const [lastSearchTime, setLastSearchTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const validateInput = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return { valid: false, message: null };
    if (trimmed.length > 50) return { valid: false, message: '單字太長了（上限 50 字元）' };
    if (!/^[a-zA-Z\s-]+$/.test(trimmed)) return { valid: false, message: '請輸入有效的英文單字（僅限字母、空格與連字號）' };
    return { valid: true, message: null };
  };

  const validateUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.origin === 'https://dictionary.cambridge.org';
    } catch {
      return false;
    }
  };

  const handleSearch = async (query: string) => {
    const validation = validateInput(query);
    if (!validation.valid) {
      if (validation.message) setError(validation.message);
      return;
    }

    // Simple rate limiting: 2 seconds cooldown
    const now = Date.now();
    if (now - lastSearchTime < 2000) {
      setError('請稍候再試（查詢速度過快）');
      return;
    }
    setLastSearchTime(now);

    setLoading(true);
    setError(null);
    try {
      const [geminiRes, dictRes] = await Promise.all([
        getWordDetails(query.trim()),
        getDictionaryData(query.trim())
      ]);
      setWordData(geminiRes);
      setDictData(dictRes);
    } catch (err) {
      console.error(err);
      setError('找不到該單字的資訊，請嘗試其他單字。');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToVocab = async () => {
    if (!user) {
      try {
        await signInWithGoogle();
      } catch (err) {
        console.error("Login failed", err);
        return;
      }
    }

    if (wordData && user) {
      setAddingWord(true);
      try {
        const result = await addWordToVocab(user.uid, wordData.word);
        if (result.success) {
          setAddedWords(prev => new Set(prev).add(wordData.word));
        }
      } catch (err) {
        console.error("Failed to add word", err);
      } finally {
        setAddingWord(false);
      }
    }
  };

  const playAudio = (url: string, word: string, type: 'uk' | 'us') => {
    if (!url) {
      speak(word, type);
      return;
    }

    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = url;
        audioRef.current.play().catch(() => speak(word, type));
      } else {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.play().catch(() => speak(word, type));
      }
    } catch (err) {
      speak(word, type);
    }
  };

  const speak = (text: string, type: 'uk' | 'us') => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // Stop any current speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = type === 'uk' ? 'en-GB' : 'en-US';
    utterance.rate = 0.9; // Slightly slower for clarity
    window.speechSynthesis.speak(utterance);
  };

  const getAudio = (type: 'uk' | 'us') => {
    if (!dictData || !dictData.phonetics) return null;
    
    const audios = dictData.phonetics.filter(p => p.audio && p.audio.length > 0);
    if (audios.length === 0) return null;
    
    // Better logic: try to find matching type in the URL
    const targetAudio = audios.find(p => p.audio?.toLowerCase().includes(`-${type}`) || p.audio?.toLowerCase().includes(`/${type}/`));
    if (targetAudio) return targetAudio.audio || null;
    
    // Fallback logic
    if (type === 'uk') return audios[0].audio || null;
    return audios[1]?.audio || audios[0].audio || null;
  };

  const renderExample = (sentence: string) => {
    const words = sentence.split(' ');
    return (
      <p className="text-muted-foreground leading-relaxed">
        {words.map((word, i) => {
          const cleanWord = word.replace(/[.,!?;:()]/g, '');
          return (
            <span key={i}>
              <button
                onClick={() => {
                  setSearchQuery(cleanWord);
                  handleSearch(cleanWord);
                }}
                className="hover:text-primary hover:underline cursor-pointer transition-colors"
              >
                {word}
              </button>
              {i < words.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </p>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Header / Search Bar */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-bottom border-[#E5E7EB] py-4 px-6 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <div className="flex items-center gap-2 mr-4">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <BookOpen size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight hidden sm:block">WordFinder</h1>
          </div>
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
              placeholder="輸入英文單字..."
              className="pl-10 h-12 bg-[#F3F4F6] border-none focus-visible:ring-2 focus-visible:ring-primary/50 text-lg rounded-2xl transition-all"
            />
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-2 bg-primary/5 px-3 py-1.5 rounded-full border border-primary/10">
                <div className="w-6 h-6 rounded-full overflow-hidden border border-primary/20">
                  <img src={user.photoURL || ''} alt={user.displayName || ''} referrerPolicy="no-referrer" />
                </div>
                <span className="text-xs font-bold text-primary hidden md:block">{user.displayName}</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-destructive"
                  onClick={() => auth.signOut()}
                >
                  登出
                </Button>
              </div>
            ) : (
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-full border-primary/20 text-primary hover:bg-primary hover:text-white transition-all gap-2"
                onClick={signInWithGoogle}
              >
                <LogIn size={14} />
                <span className="hidden sm:inline">登入</span>
              </Button>
            )}
            <Button 
              onClick={() => handleSearch(searchQuery)} 
              disabled={loading}
              className="h-12 px-6 rounded-2xl shadow-lg shadow-primary/20"
            >
              {loading ? <Loader2 className="animate-spin" /> : '查詢'}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-8">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-16 w-64 rounded-xl" />
                  <p className="text-sm text-muted-foreground animate-pulse flex items-center gap-2">
                    <Loader2 className="animate-spin h-4 w-4" />
                    {loadingMessage}
                  </p>
                </div>
                <Skeleton className="h-8 w-32 rounded-lg" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <Skeleton className="h-48 w-full rounded-2xl" />
                  <Skeleton className="h-48 w-full rounded-2xl" />
                </div>
                <div className="space-y-6">
                  <Skeleton className="h-64 w-full rounded-2xl" />
                  <Skeleton className="h-64 w-full rounded-2xl" />
                </div>
              </div>
            </motion.div>
          ) : wordData && !wordData.isSpelledCorrectly ? (
            <motion.div
              key="suggestions"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center space-y-8"
            >
              <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
                <Search size={48} />
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold tracking-tight">找不到 "{searchQuery}"</h3>
                <p className="text-muted-foreground text-lg">您是不是要找：</p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {wordData.suggestions?.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="lg"
                    className="rounded-2xl hover:bg-primary hover:text-white hover:border-primary transition-all text-lg px-8"
                    onClick={() => {
                      setSearchQuery(suggestion);
                      handleSearch(suggestion);
                    }}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </motion.div>
          ) : wordData ? (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 pb-12"
            >
              {/* Word Header */}
              <section className="flex flex-col sm:flex-row sm:items-end gap-6">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-4 mb-2">
                    <h2 className="text-6xl font-black tracking-tighter text-primary">
                      {wordData.word}
                    </h2>
                    <Button
                      variant={addedWords.has(wordData.word) ? "secondary" : "outline"}
                      size="sm"
                      disabled={addingWord || addedWords.has(wordData.word)}
                      className="rounded-full border-primary/20 text-primary hover:bg-primary hover:text-white transition-all gap-2 h-9 px-4"
                      onClick={handleAddToVocab}
                    >
                      {addingWord ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : addedWords.has(wordData.word) ? (
                        <CheckCircle2 size={16} className="text-green-500" />
                      ) : (
                        <ArrowRight size={16} />
                      )}
                      {addedWords.has(wordData.word) ? '已加入 VocabMaster' : '加入 VocabMaster'}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    {/* UK Pronunciation */}
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border shadow-sm">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">UK</span>
                      <span className="text-lg font-medium text-primary/80 font-mono">
                        {wordData.phonetics.uk}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary"
                        onClick={() => playAudio(getAudio('uk') || '', wordData.word, 'uk')}
                      >
                        <Volume2 size={18} />
                      </Button>
                    </div>
                    {/* US Pronunciation */}
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border shadow-sm">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">US</span>
                      <span className="text-lg font-medium text-primary/80 font-mono">
                        {wordData.phonetics.us}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary"
                        onClick={() => playAudio(getAudio('us') || '', wordData.word, 'us')}
                      >
                        <Volume2 size={18} />
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  {/* Meanings & Examples */}
                  <Card className="border-none shadow-xl shadow-black/5 rounded-3xl overflow-hidden">
                    <CardHeader className="bg-white border-b border-[#F3F4F6] py-6 flex flex-row items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-xl font-bold">
                        <BookOpen className="text-primary" size={22} />
                        釋義與例句
                      </CardTitle>
                      {wordData.cambridgeUrl && validateUrl(wordData.cambridgeUrl) && (
                        <a 
                          href={wordData.cambridgeUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline flex items-center gap-1 font-medium"
                        >
                          Cambridge Dictionary <ExternalLink size={14} />
                        </a>
                      )}
                    </CardHeader>
                    <CardContent className="p-0">
                      <ScrollArea className="h-[600px]">
                        <div className="p-8 space-y-12">
                          {wordData.chineseMeanings.map((meaning, idx) => (
                            <div key={idx} className="space-y-8">
                              <div className="flex items-center gap-3">
                                <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-none px-3 py-1 text-sm font-bold rounded-lg uppercase italic">
                                  {meaning.pos}
                                </Badge>
                                <Separator className="flex-1" />
                              </div>
                              <div className="space-y-10 pl-2">
                                {meaning.definitions.map((def, dIdx) => (
                                  <div key={dIdx} className="space-y-4 group">
                                    <div className="flex gap-4">
                                      <span className="text-primary/30 font-black text-2xl leading-none">{dIdx + 1}</span>
                                      <div className="space-y-3 flex-1">
                                        <div className="space-y-1">
                                          <h4 className="text-2xl font-bold text-[#1A1A1A] leading-tight">
                                            {def.chinese}
                                          </h4>
                                          <p className="text-lg text-muted-foreground font-medium italic leading-snug">
                                            {def.english}
                                          </p>
                                        </div>
                                        
                                        {/* Paired Example */}
                                        <div className="mt-4 p-5 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
                                          <div className="flex items-start gap-3">
                                            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                            <div className="space-y-2">
                                              <div className="text-base font-medium text-[#1A1A1A]">
                                                {renderExample(def.example)}
                                              </div>
                                              <div className="text-sm text-muted-foreground font-medium border-l-2 border-primary/20 pl-3 italic">
                                                {def.exampleChinese}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-8">
                  {/* Etymology */}
                  <Card className="border-none shadow-xl shadow-black/5 rounded-3xl overflow-hidden bg-white">
                    <CardHeader className="py-6 border-b border-[#F3F4F6]">
                      <CardTitle className="flex items-center gap-2 text-xl font-bold">
                        <History className="text-primary" size={22} />
                        詞源與演進
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                      <div className="grid grid-cols-1 gap-4">
                        {wordData.etymology.prefix && (
                          <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-[#E5E7EB]">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Prefix 前綴</span>
                            <span className="text-xl font-black text-primary">{wordData.etymology.prefix}</span>
                          </div>
                        )}
                        {wordData.etymology.root && (
                          <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-[#E5E7EB]">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Root 字根</span>
                            <span className="text-xl font-black text-primary">{wordData.etymology.root}</span>
                          </div>
                        )}
                        {wordData.etymology.suffix && (
                          <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-[#E5E7EB]">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Suffix 後綴</span>
                            <span className="text-xl font-black text-primary">{wordData.etymology.suffix}</span>
                          </div>
                        )}
                      </div>
                      <div className="prose prose-sm prose-slate max-w-none">
                        <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2">演進說明</h4>
                        <div className="text-muted-foreground leading-relaxed">
                          <ReactMarkdown>{wordData.etymology.evolution}</ReactMarkdown>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Visuwords Embed - Moved to bottom and made larger */}
              <Card className="border-none shadow-xl shadow-black/5 rounded-3xl overflow-hidden bg-white">
                <CardHeader className="py-6 border-b border-[#F3F4F6]">
                  <CardTitle className="flex items-center justify-between gap-2 text-xl font-bold">
                    <div className="flex items-center gap-2">
                      <ExternalLink className="text-primary" size={22} />
                      視覺化關聯 (Visuwords)
                    </div>
                    <a 
                      href={`https://visuwords.com/${wordData.word}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                    >
                      開啟全螢幕 <ExternalLink size={12} />
                    </a>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 aspect-video min-h-[500px] lg:min-h-[700px]">
                  <iframe
                    src={`https://visuwords.com/${encodeURIComponent(wordData.word)}`}
                    className="w-full h-full border-none"
                    title="Visuwords Visualization"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                    referrerPolicy="no-referrer"
                  />
                </CardContent>
              </Card>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center space-y-4"
            >
              <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center text-destructive">
                <Loader2 size={40} />
              </div>
              <h3 className="text-2xl font-bold">{error}</h3>
              <p className="text-muted-foreground">請檢查拼字或嘗試其他常見單字。</p>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-32 text-center space-y-6"
            >
              <div className="w-32 h-32 bg-primary/5 rounded-full flex items-center justify-center text-primary/20">
                <Search size={64} />
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold tracking-tight">開始探索單字</h3>
                <p className="text-muted-foreground text-lg max-w-md mx-auto">
                  輸入任何英文單字，我們將為您提供詳細的釋義、詞源、例句與視覺化關聯。
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {['resilient', 'serendipity', 'ephemeral', 'eloquent', 'ubiquitous'].map(w => (
                  <Button
                    key={w}
                    variant="outline"
                    className="rounded-full hover:bg-primary hover:text-white hover:border-primary transition-all"
                    onClick={() => {
                      setSearchQuery(w);
                      handleSearch(w);
                    }}
                  >
                    {w}
                  </Button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto p-6 text-center text-muted-foreground text-sm border-t border-[#E5E7EB] mt-12">
        <p>© 2026 WordFinder. Powered by Google Gemini & Free Dictionary API.</p>
      </footer>
    </div>
  );
}
