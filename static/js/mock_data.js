// ===== USER - Owner =====
const user = {
    name: "Jordan",
    role: "Pet Owner",
    email: "jordan@email.com",
    phone: "012-3456789",
    gender: "Male",
    my_rating: 4.8
  };
  
  
  // ===== DASHBOARD =====
  const dashboard = {
    totalServices: 12,
  
    applicationStatus: {
      pending: 3,
      approved: 2,
      rejected: 1
    },
  
    serviceTypes: [
      { label: "Pet Sitting", value: 4 },
      { label: "Pet Day Care", value: 2 },
      { label: "Pet Taxi", value: 2 },
      { label: "Pet Training", value: 1 },
      { label: "Dog Walking", value: 3 }
    ]
  };
  
  
  // ===== SERVICES =====
  const services = {
    latest: [
      {
        id: 1,
        serviceType: "Pet Walking",
        petType: "Dog",
        pets: 2,
        date: "10 June 2026",
        time: "9:00 AM",
        location: "Puchong",
        salary: "RM 30"
      },
      {
        id: 2,
        serviceType: "Pet Feeding",
        petType: "Cat",
        pets: 1,
        date: "15 June 2026",
        time: "7:00 PM",
        location: "Petaling Jaya",
        salary: "RM 25"
      }
    ],

  
    upcoming: [
      {
        id: 3,
        serviceType: "Pet Taxi",
        petType: "Cat",
        pets: 1,
        date: "20 June 2026",
        time: "8:00 AM",
        location: "Damansara",
        salary: "RM 100"
      }
    ],
  
    completed: [
      {
        id: 3,
        serviceType: "Pet Training",
        petType: "Cat",
        pets: 1,
        date: "25 June 2026",
        time: "4:00 PM",
        location: "Cheras",
        salary: "RM 50"
      }
    ]
  };
  
  
  // ===== APPLICATIONS =====
  const applications = [
    {
      id: 1,
      name: "Amanda Lee",
      gender: "Female",
      age: 22,
      experience: "2 years",
      rating: 4.7,
      service: "Pet Walking",
      status: "Pending",
      description: "Experienced with active dogs."
    },
    {
      id: 2,
      name: "Jason Tan",
      gender: "Male",
      age: 24,
      experience: "3 years",
      rating: 4.9,
      service: "Pet Feeding",
      status: "Approved",
      phone: "012-9876543",
      email: "jason@email.com"
    },
    {
      id: 3,
      name: "Sarah Lim",
      gender: "Female",
      age: 21,
      experience: "1 year",
      rating: 4.3,
      service: "Pet Boarding",
      status: "Rejected",
      description: "Available weekends only."
    }
  ];
  
  
  // ===== NOTIFICATIONS =====
  const notifications = [
    {
      id: 1,
      title: "New application received",
      message: "A sitter applied for your Pet Walking service.",
      time: "2 hours ago",
      read: false
    },
    {
      id: 2,
      title: "Upcoming service reminder",
      message: "Your Pet Feeding service is tomorrow at 7:00 PM.",
      time: "5 hours ago",
      read: false
    },
    {
      id: 3,
      title: "New rating received",
      message: "You received a 5-star rating.",
      time: "1 day ago",
      read: true
    }
  ];
  
  
  // ===== PROFILE =====
  const profile = {
    username: "Jordan",
    email: "jordan@email.com",
    phone: "012-3456789",
    gender: "Male"
  };
