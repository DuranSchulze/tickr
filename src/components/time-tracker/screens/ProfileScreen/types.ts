export type SelfProfileData = {
  user: {
    id: string
    name: string
    email: string
    image: string | null
  }
  profile: {
    firstName: string
    middleName: string
    lastName: string
    contactNumber: string
    birthDate: string
    gender: string
    maritalStatus: string
  } | null
  address: {
    buildingNo: string
    street: string
    city: string
    province: string
    postalCode: string
    country: string
  } | null
}

export type AddressDraft = {
  buildingNo: string
  street: string
  city: string
  province: string
  postalCode: string
  country: string
}
