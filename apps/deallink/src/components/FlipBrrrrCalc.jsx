import React, { useEffect, useRef } from 'react';

export default function FlipBrrrrCalc({ deal, dispatch, mode = 'flip' }) {
  const iframeRef = useRef(null);

  function handleLoad() {
    const frame = iframeRef.current;
    if (!frame) return;
    try {
      frame.contentWindow.postMessage({
        type: 'REI_PREFILL',
        mode,
        deal: {
          purchasePrice: deal?.ask || 0,
          rehabCost: 0,
          arv: deal?.arv || 0,
          address: deal?.addr || '',
          calcState: deal?.imConfig?.calcState || null,
        },
      }, '*');
    } catch (e) {}
  }

  useEffect(() => {
    function handleMessage(e) {
      if (e.data?.type === 'REI_SAVE' && e.data?.calcState) {
        const baseCfg = (deal.imConfig && typeof deal.imConfig === 'object') ? deal.imConfig : {};
        dispatch({
          type: 'update_deal',
          id: deal.id,
          patch: {
            imConfig: {
              ...baseCfg,
              calcState: e.data.calcState,
              ...(e.data.summary ? { summary: e.data.summary } : {}),
            },
          },
        });
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [deal, dispatch]);

  return (
    <div style={{ width: '100%', height: '100vh', minHeight: 700 }}>
      <iframe
        ref={iframeRef}
        src={`/deal-calc.html?mode=${mode}`}
        onLoad={handleLoad}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Deal Calculator"
      />
    </div>
  );
}
