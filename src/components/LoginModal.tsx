"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const router = useRouter();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-navy/20 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4">
            <motion.div
              className="bg-cream w-full max-w-sm rounded-2xl border-2 border-navy p-6 shadow-xl relative pointer-events-auto flex flex-col items-center text-center"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 text-navy hover:text-point transition-colors"
                aria-label="Close modal"
              >
                <X size={20} strokeWidth={2} />
              </button>
              
              <div className="w-12 h-12 rounded-full border-2 border-navy flex items-center justify-center mb-4 mt-2">
                <div className="w-4 h-4 bg-point rounded-full border border-navy" />
              </div>
              
              <h2 className="font-serif text-2xl text-navy mb-2">Record Shop</h2>
              <p className="font-sans text-charcoal/80 mb-8">
                데이터 저장을 위해<br/>로그인하시겠습니까?
              </p>
              
              <div className="w-full flex flex-col gap-3">
                <button 
                  className="w-full py-3 bg-navy text-cream font-medium rounded-full hover:bg-navy/90 transition-colors"
                >
                  로그인하기
                </button>
                <button 
                  onClick={() => {
                    onClose();
                    router.push("/explore");
                  }}
                  className="w-full py-3 bg-transparent border-2 border-navy text-navy font-medium rounded-full hover:bg-navy/5 transition-colors"
                >
                  게스트로 시작하기
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
