import React from 'react';
import { Link } from 'react-router-dom';
import { GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import Layout from '../components/Layout.jsx';
import { useStore } from '../store.jsx';
import { STATUS_STYLES } from '../components/ui.jsx';
import { useStore as _useStore } from '../store.jsx';
import { DEAL_STATUSES as STATUSES } from '../lib/deallink-api.js';

const COLUMNS = STATUSES.map((id) => ({ id, label: id, ...STATUS_STYLES[id] }));

export default function Pipeline() {
  const { state, dispatch } = useStore();
  const deals = state.deals;

  function onDragEnd(result) {
    if (!result.destination) return;
    const dealId = result.draggableId;
    const newStatus = result.destination.droppableId;
    const deal = deals.find((d) => String(d.id) === dealId);
    if (!deal || deal.status === newStatus) return;
    dispatch({ type: 'update_deal', id: deal.id, patch: { status: newStatus } });
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Deal Pipeline</h1>
          <p className="text-slate-400 text-sm mt-1">Drag deals between stages to update status.</p>
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
            {COLUMNS.map((col) => {
              const colDeals = deals.filter((d) => d.status === col.id);
              const totalValue = colDeals.reduce((s, d) => s + (Number(d.ask) || 0), 0);
              return (
                <div key={col.id} className="flex-shrink-0 w-64">
                  <div className={`flex items-center justify-between mb-3 pb-3 border-b-2 ${col.border}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                      <span className="text-white font-semibold text-sm">{col.label}</span>
                      <span className="bg-slate-800 text-slate-300 text-xs w-5 h-5 rounded-full flex items-center justify-center">{colDeals.length}</span>
                    </div>
                    {totalValue > 0 && <span className="text-slate-400 text-xs">${totalValue.toLocaleString()}</span>}
                  </div>

                  <Droppable droppableId={col.id}>
                    {(prov, snapshot) => (
                      <div
                        ref={prov.innerRef}
                        {...prov.droppableProps}
                        className={`space-y-3 min-h-[100px] rounded-lg ${snapshot.isDraggingOver ? 'bg-slate-800/30' : ''}`}
                      >
                        {colDeals.map((d, idx) => (
                          <Draggable key={d.id} draggableId={String(d.id)} index={idx}>
                            {(p) => (
                              <div
                                ref={p.innerRef}
                                {...p.draggableProps}
                                {...p.dragHandleProps}
                                className="bg-slate-900 border border-slate-700 rounded-xl p-4 cursor-grab hover:border-slate-500 transition-colors"
                              >
                                <div className="flex items-start gap-2">
                                  <GripVertical className="w-3 h-3 text-slate-600 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white text-xs font-semibold truncate">{d.addr || '—'}</p>
                                    <p className="text-slate-400 text-xs truncate">{[d.city, d.state].filter(Boolean).join(', ')}</p>
                                  </div>
                                </div>
                                <div className="mt-3 pt-3 border-t border-slate-700">
                                  <div className="flex justify-between text-xs">
                                    <div>
                                      <p className="text-slate-500">Asking</p>
                                      <p className="text-white font-semibold">${Number(d.ask || 0).toLocaleString()}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-slate-500">ARV</p>
                                      <p className="text-green-400 font-semibold">${Number(d.arv || 0).toLocaleString()}</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                  <span className="text-slate-500 text-xs">{d.type}</span>
                                  <Link to={`/admin/deal/${d.id}`} className="text-xs text-amber-400 hover:underline">View →</Link>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {prov.placeholder}
                        {colDeals.length === 0 && (
                          <div className="border-2 border-dashed border-slate-700 rounded-xl h-16 flex items-center justify-center">
                            <span className="text-slate-600 text-xs">Drop deals here</span>
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>
    </Layout>
  );
}
