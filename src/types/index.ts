export interface Guard {
  id: string;
  name: string;
  // agrega los campos que tenga tu colección en Firestore
}

export interface Unit {
  id: string;
  name: string;
  address: string;
  status: string;
}

export interface Assignment {
  id: string;
  guardId: string;
  unitId: string;
  date: Date;
  shiftType: string;
}