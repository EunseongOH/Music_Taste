import LPPlayer from "@/components/LPPlayer";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-between p-8 md:p-24 relative overflow-hidden">
      <div className="flex flex-col items-center justify-center flex-1 w-full text-center z-10 space-y-8 mt-12 md:mt-0">
        <div className="space-y-4">
          <h1 className="font-serif text-4xl md:text-6xl text-navy tracking-tight drop-shadow-sm">
            Analog Record Shop
          </h1>
          <p className="font-sans text-lg md:text-xl text-charcoal/80 max-w-md mx-auto leading-relaxed">
            당신의 음악적 온도를 확인해보세요.
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <button className="px-8 py-3 bg-navy text-cream rounded-full hover:bg-navy/90 transition-colors font-medium">
            시작하기
          </button>
          <button className="px-8 py-3 border border-navy text-navy rounded-full hover:bg-navy/5 transition-colors font-medium">
            게스트로 둘러보기
          </button>
        </div>
      </div>

      <div className="w-full flex justify-center mt-auto pt-16 pb-8 z-10">
         <LPPlayer />
      </div>
    </main>
  );
}
