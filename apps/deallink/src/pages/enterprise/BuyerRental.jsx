import React from 'react';
import { UserCheck, Star, Clock, DollarSign } from 'lucide-react';
import Layout from '../../components/Layout.jsx';
import { Card, CardHeader, CardTitle, Button, PageHeader } from '../../components/ui.jsx';
import { EnterpriseBanner } from './EnterpriseMock.jsx';

const lists = [
  { name: 'DFW Cash Buyers · Tier 1',     buyers: 142, avgClose: '7d',  rating: 4.9, price: 49 },
  { name: 'Atlanta Flippers · Verified',  buyers: 86,  avgClose: '14d', rating: 4.7, price: 39 },
  { name: 'Phoenix Landlords · Premium',  buyers: 213, avgClose: '21d', rating: 4.8, price: 59 },
  { name: 'Memphis Wholesalers',          buyers: 54,  avgClose: '10d', rating: 4.5, price: 29 },
];

export default function BuyerRental() {
  return (
    <Layout>
      <PageHeader title="Buyer Rental" subtitle="Rent verified buyer lists from top wholesalers" actions={<Button><UserCheck className="w-4 h-4" /> List my buyers</Button>} />
      <EnterpriseBanner />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {lists.map((l) => (
          <Card key={l.name} className="p-5 hover:border-[rgba(0,0,0,0.12)] transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[#1d1d1f] font-semibold">{l.name}</p>
                <p className="text-[#6e6e73] text-xs mt-1">{l.buyers} verified buyers</p>
              </div>
              <span className="flex items-center gap-1 bg-[rgba(184,134,11,0.10)] text-[#b8860b] px-2 py-1 rounded-full text-xs font-bold"><Star className="w-3 h-3 fill-current" /> {l.rating}</span>
            </div>
            <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.08)] grid grid-cols-2 gap-4">
              <div><p className="text-[#86868b] text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Avg close</p><p className="text-[#1d1d1f] font-mono font-semibold mt-1">{l.avgClose}</p></div>
              <div><p className="text-[#86868b] text-xs flex items-center gap-1"><DollarSign className="w-3 h-3" /> Per blast</p><p className="text-[#b8860b] font-mono font-semibold mt-1">${l.price}</p></div>
            </div>
            <Button className="w-full mt-4">Rent for one blast</Button>
          </Card>
        ))}
      </div>
    </Layout>
  );
}
